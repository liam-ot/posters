// Pure SVG path-data builders. Only absolute M/L/Q/C/Z commands are emitted, so
// the output is easy to test and Konva.Path parses it directly.

export interface Pt {
  x: number
  y: number
}

/** Round to 3 decimals: compact, deterministic path strings. */
export const n = (v: number) => String(Math.round(v * 1000) / 1000)
const p = (pt: Pt) => `${n(pt.x)} ${n(pt.y)}`

export function polyline(pts: Pt[], closed: boolean): string {
  if (!pts.length) return ''
  return `M${p(pts[0])}${pts
    .slice(1)
    .map((q) => `L${p(q)}`)
    .join('')}${closed ? 'Z' : ''}`
}

/**
 * Cubic segments (no leading M) of a smooth curve through `pts`, Catmull-Rom →
 * Bézier. Dense samples keep overshoot negligible.
 */
export function curveTo(pts: Pt[], closed = false): string {
  const at = (i: number) =>
    closed ? pts[(i + pts.length) % pts.length] : pts[Math.min(pts.length - 1, Math.max(0, i))]
  const segs = closed ? pts.length : pts.length - 1
  let d = ''
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += `C${p(c1)} ${p(c2)} ${p(p2)}`
  }
  return d
}

export function smoothPath(pts: Pt[], closed = false): string {
  if (pts.length < 3) return polyline(pts, closed)
  return `M${p(pts[0])}${curveTo(pts, closed)}${closed ? 'Z' : ''}`
}

const KAPPA = 0.5522847498

/** An ellipse as four cubic Béziers (no arc commands, so bounds are easy to reason about). */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * KAPPA
  const ky = ry * KAPPA
  return (
    `M${n(cx + rx)} ${n(cy)}` +
    `C${n(cx + rx)} ${n(cy + ky)} ${n(cx + kx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}` +
    `C${n(cx - kx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + ky)} ${n(cx - rx)} ${n(cy)}` +
    `C${n(cx - rx)} ${n(cy - ky)} ${n(cx - kx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}` +
    `C${n(cx + kx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - ky)} ${n(cx + rx)} ${n(cy)}Z`
  )
}

/** Closed polygon with rounded corners (`round` 0..1 of half an edge). */
export function roundedPolygon(pts: Pt[], round: number): string {
  if (round <= 0) return polyline(pts, true)
  const k = Math.min(1, round) * 0.5
  const m = pts.length
  const toward = (a: Pt, b: Pt): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
  let d = ''
  for (let i = 0; i < m; i++) {
    const v = pts[i]
    const a = toward(v, pts[(i - 1 + m) % m])
    const b = toward(v, pts[(i + 1) % m])
    d += `${i === 0 ? 'M' : 'L'}${p(a)}Q${p(v)} ${p(b)}`
  }
  return d + 'Z'
}

/** Points around an ellipse inscribed in a w×h box; angle 0 is straight up. */
export function ellipsePoint(w: number, h: number, angle: number, radius = 1): Pt {
  return {
    x: w / 2 + (w / 2) * radius * Math.sin(angle),
    y: h / 2 - (h / 2) * radius * Math.cos(angle),
  }
}

export function bounds(pts: Pt[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const q of pts) {
    minX = Math.min(minX, q.x)
    minY = Math.min(minY, q.y)
    maxX = Math.max(maxX, q.x)
    maxY = Math.max(maxY, q.y)
  }
  return { minX, minY, maxX, maxY }
}

/** Linearly map points so their bounds exactly fill a w×h box. */
export function fitToBox(pts: Pt[], w: number, h: number): Pt[] {
  const b = bounds(pts)
  const sx = b.maxX > b.minX ? w / (b.maxX - b.minX) : 1
  const sy = b.maxY > b.minY ? h / (b.maxY - b.minY) : 1
  return pts.map((q) => ({ x: (q.x - b.minX) * sx, y: (q.y - b.minY) * sy }))
}
