import type { ParamControl, ParamValue } from '../generators/config'
import { mulberry32 } from '../generators/util'
import type { ShapeKind } from '../types/poster'
import {
  type Pt,
  curveTo,
  ellipsePath,
  ellipsePoint,
  fitToBox,
  n,
  polyline,
  roundedPolygon,
  smoothPath,
} from './geometry'

export type ShapeParams = Record<string, ParamValue>

/** One drawable piece of a shape. Style (fill/stroke) comes from the layer. */
export interface ShapeGeometry {
  d: string
  fillRule: 'nonzero' | 'evenodd'
}

export interface ShapeDef {
  kind: ShapeKind
  label: string
  /** Line shapes default to a stroke and no fill; closed shapes to a fill. */
  line: boolean
  /** Default layer size (px). */
  size: { w: number; h: number }
  defaults: ShapeParams
  controls: ParamControl[]
  generate(params: ShapeParams, w: number, h: number): ShapeGeometry[]
}

const TAU = Math.PI * 2
const num = (p: ShapeParams, k: string) => Number(p[k])
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const one = (d: string, fillRule: ShapeGeometry['fillRule'] = 'nonzero'): ShapeGeometry[] => [
  { d, fillRule },
]
const slider = (key: string, label: string, min: number, max: number, step: number): ParamControl => ({
  key,
  label,
  type: 'slider',
  min,
  max,
  step,
})

const defs: ShapeDef[] = [
  {
    kind: 'star',
    label: 'Star',
    line: false,
    size: { w: 300, h: 300 },
    defaults: { points: 5, inner: 40 },
    controls: [slider('points', 'Points', 3, 20, 1), slider('inner', 'Inner radius', 10, 95, 1)],
    generate(p, w, h) {
      const k = Math.round(clamp(num(p, 'points'), 3, 20))
      const inner = clamp(num(p, 'inner'), 1, 100) / 100
      const pts: Pt[] = []
      for (let i = 0; i < k * 2; i++) {
        pts.push(ellipsePoint(w, h, (i * Math.PI) / k, i % 2 ? inner : 1))
      }
      return one(polyline(pts, true))
    },
  },
  {
    kind: 'polygon',
    label: 'Polygon',
    line: false,
    size: { w: 300, h: 300 },
    defaults: { sides: 6, rounding: 0 },
    controls: [slider('sides', 'Sides', 3, 12, 1), slider('rounding', 'Rounding', 0, 100, 1)],
    generate(p, w, h) {
      const k = Math.round(clamp(num(p, 'sides'), 3, 12))
      const pts = Array.from({ length: k }, (_, i) => ellipsePoint(w, h, (i * TAU) / k))
      return one(roundedPolygon(pts, clamp(num(p, 'rounding'), 0, 100) / 100))
    },
  },
  {
    kind: 'triangle',
    label: 'Triangle',
    line: false,
    size: { w: 300, h: 260 },
    defaults: { apex: 50 },
    controls: [slider('apex', 'Apex position', 0, 100, 1)],
    generate(p, w, h) {
      const ax = (clamp(num(p, 'apex'), 0, 100) / 100) * w
      return one(polyline([{ x: ax, y: 0 }, { x: w, y: h }, { x: 0, y: h }], true))
    },
  },
  {
    kind: 'burst',
    label: 'Burst',
    line: false,
    size: { w: 320, h: 320 },
    defaults: { points: 16, inner: 55, jagged: 0.35, seed: 7 },
    controls: [
      slider('points', 'Points', 6, 40, 1),
      slider('inner', 'Inner radius', 10, 95, 1),
      slider('jagged', 'Jaggedness', 0, 1, 0.01),
      slider('seed', 'Shuffle', 0, 999, 1),
    ],
    generate(p, w, h) {
      const k = Math.round(clamp(num(p, 'points'), 6, 40))
      const inner = clamp(num(p, 'inner'), 1, 100) / 100
      const jag = clamp(num(p, 'jagged'), 0, 1)
      const rand = mulberry32(Math.round(num(p, 'seed')))
      const pts: Pt[] = []
      for (let i = 0; i < k * 2; i++) {
        const base = i % 2 ? inner : 1
        // Only ever shrink, so the burst stays inside its box.
        const r = base * (1 - jag * 0.5 * rand())
        pts.push(ellipsePoint(w, h, (i * Math.PI) / k, r))
      }
      return one(polyline(pts, true))
    },
  },
  {
    kind: 'ring',
    label: 'Ring',
    line: false,
    size: { w: 300, h: 300 },
    defaults: { thickness: 25 },
    controls: [slider('thickness', 'Thickness', 3, 60, 1)],
    generate(p, w, h) {
      const t = (clamp(num(p, 'thickness'), 1, 99) / 100) * Math.min(w, h) * 0.5
      const outer = ellipsePath(w / 2, h / 2, w / 2, h / 2)
      const hole = ellipsePath(w / 2, h / 2, Math.max(0.5, w / 2 - t), Math.max(0.5, h / 2 - t))
      return one(outer + hole, 'evenodd')
    },
  },
  {
    kind: 'arrow',
    label: 'Arrow',
    line: false,
    size: { w: 360, h: 180 },
    defaults: { shaft: 30, headLength: 40, headWidth: 100 },
    controls: [
      slider('shaft', 'Shaft thickness', 5, 100, 1),
      slider('headLength', 'Head length', 10, 90, 1),
      slider('headWidth', 'Head width', 20, 100, 1),
    ],
    generate(p, w, h) {
      const hw = (clamp(num(p, 'headWidth'), 1, 100) / 100) * h
      const shaft = Math.min((clamp(num(p, 'shaft'), 1, 100) / 100) * h, hw)
      const hl = (clamp(num(p, 'headLength'), 1, 100) / 100) * w
      const cy = h / 2
      const x = w - hl
      return one(
        polyline(
          [
            { x: 0, y: cy - shaft / 2 },
            { x, y: cy - shaft / 2 },
            { x, y: cy - hw / 2 },
            { x: w, y: cy },
            { x, y: cy + hw / 2 },
            { x, y: cy + shaft / 2 },
            { x: 0, y: cy + shaft / 2 },
          ],
          true,
        ),
      )
    },
  },
  {
    kind: 'cross',
    label: 'Cross',
    line: false,
    size: { w: 280, h: 280 },
    defaults: { arm: 33 },
    controls: [slider('arm', 'Arm thickness', 8, 90, 1)],
    generate(p, w, h) {
      const a = clamp(num(p, 'arm'), 1, 100) / 100
      const x0 = (w * (1 - a)) / 2
      const x1 = w - x0
      const y0 = (h * (1 - a)) / 2
      const y1 = h - y0
      return one(
        polyline(
          [
            { x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: y0 }, { x: w, y: y0 },
            { x: w, y: y1 }, { x: x1, y: y1 }, { x: x1, y: h }, { x: x0, y: h },
            { x: x0, y: y1 }, { x: 0, y: y1 }, { x: 0, y: y0 }, { x: x0, y: y0 },
          ],
          true,
        ),
      )
    },
  },
  {
    kind: 'swoosh',
    label: 'Swoosh',
    line: false,
    size: { w: 420, h: 120 },
    defaults: { curvature: 70, thickness: 30, taper: true },
    controls: [
      slider('curvature', 'Curvature', 0, 100, 1),
      slider('thickness', 'Thickness', 4, 80, 1),
      { key: 'taper', label: 'Taper', type: 'toggle' },
    ],
    generate(p, w, h) {
      const thick = (clamp(num(p, 'thickness'), 1, 100) / 100) * h
      const sag = (clamp(num(p, 'curvature'), 0, 100) / 100) * Math.max(0, h - thick)
      const taper = !!p.taper
      // Quadratic centreline dipping `sag` below its ends; a band of varying
      // thickness is offset along the normals.
      const y0 = thick / 2
      const cy = y0 + 2 * sag
      const N = 28
      const top: Pt[] = []
      const bottom: Pt[] = []
      for (let i = 0; i <= N; i++) {
        const t = i / N
        // With the control point at x = w/2, x(t) is linear: x = t·w.
        const x = t * w
        const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y0
        const dx = w
        const dy = 2 * (cy - y0) * (1 - 2 * t)
        const len = Math.hypot(dx, dy) || 1
        const half = (thick / 2) * (taper ? Math.sin(Math.PI * t) : 1)
        top.push({ x: x + (dy / len) * half, y: y - (dx / len) * half })
        bottom.push({ x: x - (dy / len) * half, y: y + (dx / len) * half })
      }
      // Normals tilt at the ends, so fit the outline to the box exactly. The two
      // edges are smoothed separately and joined with straight segments: a
      // single closed curve would overshoot at the sharp tapered tips.
      const fitted = fitToBox([...top, ...bottom], w, h)
      const upper = fitted.slice(0, N + 1)
      const lower = fitted.slice(N + 1).reverse()
      return one(
        `M${n(upper[0].x)} ${n(upper[0].y)}${curveTo(upper)}` +
          `L${n(lower[0].x)} ${n(lower[0].y)}${curveTo(lower)}Z`,
      )
    },
  },
  {
    kind: 'squiggle',
    label: 'Squiggle',
    line: true,
    size: { w: 480, h: 120 },
    defaults: { waves: 4, amplitude: 70, smoothness: 0.8 },
    controls: [
      slider('waves', 'Waves', 1, 12, 1),
      slider('amplitude', 'Amplitude', 5, 100, 1),
      slider('smoothness', 'Smoothness', 0, 1, 0.01),
    ],
    generate(p, w, h) {
      const waves = Math.round(clamp(num(p, 'waves'), 1, 12))
      const A = (clamp(num(p, 'amplitude'), 1, 100) / 100) * (h / 2)
      const segs = waves * 2
      const dx = w / segs
      const k = dx * clamp(num(p, 'smoothness'), 0, 1) * 0.5
      const y = (i: number) => h / 2 + (i % 2 ? A : -A)
      let d = `M0 ${n(y(0))}`
      for (let i = 0; i < segs; i++) {
        const x0 = i * dx
        const x1 = (i + 1) * dx
        d += `C${n(x0 + k)} ${n(y(i))} ${n(x1 - k)} ${n(y(i + 1))} ${n(x1)} ${n(y(i + 1))}`
      }
      return one(d)
    },
  },
  {
    kind: 'zigzag',
    label: 'Zigzag',
    line: true,
    size: { w: 480, h: 120 },
    defaults: { peaks: 6, amplitude: 70 },
    controls: [slider('peaks', 'Peaks', 2, 24, 1), slider('amplitude', 'Amplitude', 5, 100, 1)],
    generate(p, w, h) {
      const peaks = Math.round(clamp(num(p, 'peaks'), 2, 24))
      const A = (clamp(num(p, 'amplitude'), 1, 100) / 100) * (h / 2)
      const segs = peaks * 2
      const pts = Array.from({ length: segs + 1 }, (_, i) => ({
        x: (w * i) / segs,
        y: h / 2 + (i % 2 ? -A : A),
      }))
      return one(polyline(pts, false))
    },
  },
  {
    kind: 'wave',
    label: 'Wave',
    line: true,
    size: { w: 480, h: 120 },
    defaults: { cycles: 2, amplitude: 70, phase: 0 },
    controls: [
      slider('cycles', 'Cycles', 0.5, 10, 0.5),
      slider('amplitude', 'Amplitude', 5, 100, 1),
      slider('phase', 'Phase', 0, 360, 1),
    ],
    generate(p, w, h) {
      const cycles = clamp(num(p, 'cycles'), 0.5, 10)
      const A = (clamp(num(p, 'amplitude'), 1, 100) / 100) * (h / 2)
      const phase = (clamp(num(p, 'phase'), 0, 360) * Math.PI) / 180
      const N = Math.max(8, Math.ceil(cycles * 16))
      const pts = Array.from({ length: N + 1 }, (_, i) => ({
        x: (w * i) / N,
        y: h / 2 - A * Math.sin(TAU * cycles * (i / N) + phase),
      }))
      return one(smoothPath(pts))
    },
  },
  {
    kind: 'spiral',
    label: 'Spiral',
    line: true,
    size: { w: 300, h: 300 },
    defaults: { turns: 3, inner: 10 },
    controls: [slider('turns', 'Turns', 1, 10, 0.5), slider('inner', 'Inner radius', 0, 80, 1)],
    generate(p, w, h) {
      const turns = clamp(num(p, 'turns'), 0.5, 10)
      const r0 = clamp(num(p, 'inner'), 0, 95) / 100
      const N = Math.ceil(turns * 28)
      const pts = Array.from({ length: N + 1 }, (_, i) => {
        const t = i / N
        return ellipsePoint(w, h, TAU * turns * t, r0 + (1 - r0) * t)
      })
      return one(smoothPath(pts))
    },
  },
]

export const SHAPES = Object.fromEntries(defs.map((d) => [d.kind, d])) as Record<ShapeKind, ShapeDef>
export const SHAPE_LIST = defs

export function defaultShapeParams(kind: ShapeKind): ShapeParams {
  return { ...SHAPES[kind].defaults }
}

const cache = new Map<string, ShapeGeometry[]>()
const CACHE_MAX = 300

/** Pure + memoised: geometry for a shape at a given box size. */
export function generateShape(
  kind: ShapeKind,
  params: ShapeParams,
  w: number,
  h: number,
): ShapeGeometry[] {
  const def = SHAPES[kind]
  const merged = { ...def.defaults, ...params }
  const bw = Math.max(1, w)
  const bh = Math.max(1, h)
  const key = `${kind}|${JSON.stringify(merged)}|${bw}x${bh}`
  const hit = cache.get(key)
  if (hit) return hit
  const out = def.generate(merged, bw, bh)
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
  cache.set(key, out)
  return out
}
