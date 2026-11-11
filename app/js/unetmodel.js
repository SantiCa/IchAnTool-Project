// @ts-check
// U-Net session ownership and inference orchestration. Browser services are injected by app.js.
import { UNET_DEFAULTS, predictProb } from './unet.js';

/** @typedef {{data: Float32Array, dims: number[]}} UnetOutput */
/** @typedef {{inputNames: string[], outputNames: string[], run: (feeds: Object) => Promise<Record<string, UnetOutput>>}} UnetSession */
/** @typedef {{InferenceSession: {create: (bytes: Uint8Array, options: {executionProviders: string[]}) => Promise<UnetSession>}, Tensor: new (type: string, data: Float32Array, dims: number[]) => Object}} UnetRuntime */
/** @typedef {{key: string, prob: Float32Array}} UnetCache */
/** @typedef {{w: number, h: number, orig: Uint8ClampedArray, roi: {x0: number, y0: number, x1: number, y1: number}, _unet?: UnetCache | null}} UnetSection */
/** @typedef {{session: UnetSession, cfg: typeof UNET_DEFAULTS, name: string, id: string}} UnetModel */

/**
 * Keep model/cache semantics independent of interface and project storage.
 * @param {{getRuntime: () => Promise<UnetRuntime>, sections: () => UnetSection[],
 *   pixelsPerCm: (section: UnetSection) => number, id: () => string,
 *   progress: (done: number, total: number) => void}} services
 */
export function createUnetController(services) {
  /** @type {UnetModel | null} */
  let model = null;

  /** @param {UnetSection} section */
  const key = (section) => model ? `${model.id}|${section.roi.x0},${section.roi.y0},${section.roi.x1},${section.roi.y1}|${section.w}x${section.h}|${services.pixelsPerCm(section).toFixed(4)}` : '';

  return {
    get model() { return model; },
    key,
    /** @param {Uint8Array} bytes @param {string | null} json @param {string} name */
    async load(bytes, json, name) {
      try {
        const runtime = await services.getRuntime();
        const cfg = { ...UNET_DEFAULTS, ...(json ? JSON.parse(json) : {}) };
        const session = await runtime.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
        model = { session, cfg, name, id: services.id() };
        for (const section of services.sections()) section._unet = null;
        return model;
      } catch (error) {
        model = null;
        throw error;
      }
    },
    /** @param {UnetSection} section */
    async probability(section) {
      const cacheKey = key(section);
      if (section._unet?.key === cacheKey) return section._unet;
      // The caller requires a loaded model before requesting inference.
      if (!model) throw new Error('U-Net model is not loaded');
      const { session, cfg } = model;
      const runtime = await services.getRuntime();
      const inName = session.inputNames[0], outName = session.outputNames[0];
      /** @param {Float32Array} data @param {number} tile */
      const run = async (data, tile) => {
        const result = await session.run({ [inName]: new runtime.Tensor('float32', data, [1, 3, tile, tile]) });
        const output = result[outName];
        return { data: output.data, channels: output.dims[1] };
      };
      const scale = cfg.pxPerCm ? cfg.pxPerCm / services.pixelsPerCm(section) : 1;
      const result = await predictProb(run, section.orig, section.w, section.h, section.roi, cfg, scale, services.progress);
      section._unet = { key: cacheKey, prob: result.prob };
      return section._unet;
    },
  };
}
