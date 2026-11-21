// SVG basic shapes → path data. Pure number-in/string-out so it can be unit
// tested; the importer reads resolved (unit-less) values from the SVG DOM.
import { ellipsePath, n } from '../shapes/geometry'

export function rectPath(x: number, y: number, w: number, h: number, rx = 0, ry = 0): string {
  if (!(w > 0) || !(h > 0)) return ''
  // Per SVG: a missing radius copies the other; both clamp to half the side.
  let rX = rx > 0 ? rx : ry
  let rY = ry > 0 ? ry : rx
  rX = Math.min(Math.max(rX, 0), w / 2)
  rY = Math.min(Math.max(rY, 0), h / 2)
  if (rX === 0 || rY === 0) {
    return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`
  }
  const a = `A${n(rX)} ${n(rY)} 0 0 1 `
  return (
    `M${n(x + rX)} ${n(y)}H${n(x + w - rX)}${a}${n(x + w)} ${n(y + rY)}` +
    `V${n(y + h - rY)}${a}${n(x + w - rX)} ${n(y + h)}` +
    `H${n(x + rX)}${a}${n(x)} ${n(y + h - rY)}` +
    `V${n(y + rY)}${a}${n(x + rX)} ${n(y)}Z`
  )
}

export function circlePath(cx: number, cy: number, r: number): string {
  return r > 0 ? ellipsePath(cx, cy, r, r) : ''
}

export function ellipseShapePath(cx: number, cy: number, rx: number, ry: number): string {
  return rx > 0 && ry > 0 ? ellipsePath(cx, cy, rx, ry) : ''
}

export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`
}

export function polyPath(points: [number, number][], close: boolean): string {
  if (points.length < 2) return ''
  return (
    `M${n(points[0][0])} ${n(points[0][1])}` +
    points
      .slice(1)
      .map(([x, y]) => `L${n(x)} ${n(y)}`)
      .join('') +
    (close ? 'Z' : '')
  )
}

/** Parse a `dasharray` computed value ("4px, 2px", "none") into numbers. */
export function parseDashArray(value: string): number[] | undefined {
  const v = value.trim()
  if (!v || v === 'none') return undefined
  const nums = v.split(/[\s,]+/).map((t) => parseFloat(t))
  if (nums.some((x) => !Number.isFinite(x) || x < 0)) return undefined
  if (nums.every((x) => x === 0)) return undefined
  // SVG repeats an odd-length list to make dash/gap pairs.
  return nums.length % 2 ? [...nums, ...nums] : nums
}
