// V0.41: SedCoreTool background worker — enhancement and detection off the main thread (the interface no longer freezes
// for 1–3 s on large images). Uses the same pure functions as the main thread, so results are identical.
import { filterImageChunks, detectMask, components } from './imageproc.js';

const filters = new Map();

self.onmessage = (e) => {
  const { id, op, a } = e.data;
  try {
    if (op === 'filters') {
      filters.set(id, filterImageChunks(a.w, a.h, a.f, a.wide));
      self.postMessage({ id, more: true });
    } else if (op === 'filterChunk') {
      const work = filters.get(id);
      if (work.append(a.rgba)) {
        filters.delete(id);
        const r = work.finish();
        self.postMessage({ id, r }, [r.buffer]);
      } else self.postMessage({ id, more: true });
    } else if (op === 'cancelFilter') {
      filters.delete(id);
    } else if (op === 'detect') {
      const m = detectMask(a.enh, a.w, a.h, a.roi, a.exclude, a.p, a.prob);
      const r = components(m, a.w, a.h, a.p.minArea);
      self.postMessage({ id, r }, [r.labels.buffer]);
    } else throw new Error('unknown op ' + op);
  } catch (err) {
    filters.delete(id);
    self.postMessage({ id, err: String(err?.message || err) });
  }
};
