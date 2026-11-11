// @ts-check
import { UNIT_TO_CM } from './core.js';

/** @typedef {{top: number, bottom: number, units: import('./core.js').DepthUnit, roi: {y0: number, y1: number}}} DepthSection */

/** Rows per centimetre of the analysis ROI. Preserve division before interval multiplication.
 * @param {DepthSection} s
 */
export function pxPerCm(s) {
  const span = (s.bottom - s.top) * UNIT_TO_CM[s.units];
  return span > 0 ? (s.roi.y1 - s.roi.y0) / span : 1;
}

/** @param {DepthSection} s @param {number} row */
export const depthAtRow = (s, row) => s.top + ((row - s.roi.y0) / (s.roi.y1 - s.roi.y0)) * (s.bottom - s.top);

/** @param {DepthSection} s @param {number} d */
export const rowAtDepth = (s, d) => s.roi.y0 + ((d - s.top) / (s.bottom - s.top)) * (s.roi.y1 - s.roi.y0);
