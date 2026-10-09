import type { StrokeStyle } from '../types/poster'

/**
 * Konva stroke props for a border style. `dotted` uses round caps + tight dashes
 * to read as dots; `dashed` uses longer segments. Both scale with the stroke
 * width so the pattern stays proportional. `solid` clears any dash.
 */
export function strokeDash(
  style: StrokeStyle | undefined,
  width: number,
): { dash?: number[]; lineCap?: 'round' | 'butt' } {
  const w = Math.max(1, width)
  if (style === 'dashed') return { dash: [w * 3, w * 2], lineCap: 'butt' }
  if (style === 'dotted') return { dash: [w, w * 1.6], lineCap: 'round' }
  return { dash: undefined, lineCap: 'butt' }
}
