import type { Matrix2D } from '../types/poster'

export const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0]

/** a·b (apply b first, then a) for SVG-style [a b c d e f] matrices. */
export function multiply(a: Matrix2D, b: Matrix2D): Matrix2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

export const isIdentity = (m: Matrix2D) => m.every((v, i) => v === IDENTITY[i])

export function invert(m: Matrix2D): Matrix2D {
  const det = m[0] * m[3] - m[1] * m[2]
  if (!det) return IDENTITY
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}

export interface Decomposed {
  x: number
  y: number
  rotation: number // degrees
  scaleX: number
  scaleY: number
  skewX: number
}

/**
 * Split an affine matrix into Konva node attrs. Konva applies translate → rotate
 * → skew → scale, which is the same convention as its own `Transform.decompose`
 * (any 2D affine fits this form; a degenerate matrix collapses to scale 0).
 */
export function decomposeMatrix([a, b, c, d, e, f]: Matrix2D): Decomposed {
  const out: Decomposed = { x: e, y: f, rotation: 0, scaleX: 0, scaleY: 0, skewX: 0 }
  const delta = a * d - b * c
  if (a !== 0 || b !== 0) {
    const r = Math.hypot(a, b)
    out.rotation = (Math.atan2(b, a) * 180) / Math.PI
    out.scaleX = r
    out.scaleY = delta / r
    out.skewX = (a * c + b * d) / delta
  } else if (c !== 0 || d !== 0) {
    const s = Math.hypot(c, d)
    out.rotation = 90 - (Math.atan2(d, c) * 180) / Math.PI
    out.scaleX = delta / s
    out.scaleY = s
  }
  return out
}
