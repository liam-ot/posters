import type { GradientStop, Paint } from '../types/poster'
import { formatColor, parseColor } from './color'

export interface GradientCtx {
  idoc: Document
  win: Window
  /** Bounding box of the painted element in its own space (for objectBoundingBox units). */
  bbox: { x: number; y: number; width: number; height: number }
  /** Root viewBox size, for percentages in userSpaceOnUse gradients. */
  viewBox: { width: number; height: number }
  /** Extra alpha from fill-opacity / stroke-opacity. */
  opacity: number
  note: (key: string) => void
}

export type GradientResult =
  | { kind: 'paint'; paint: Paint | null }
  | { kind: 'unsupported'; what: string }
  | { kind: 'missing' }

type M = [number, number, number, number, number, number]
const IDENTITY: M = [1, 0, 0, 1, 0, 0]
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]
const pt = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })

/** A gradient and the gradients it inherits from through `href`. */
function chainOf(start: Element, idoc: Document): Element[] {
  const chain: Element[] = [start]
  let cur: Element = start
  for (let i = 0; i < 10; i++) {
    const ref = cur.getAttribute('href') ?? cur.getAttribute('xlink:href')
    if (!ref || !ref.startsWith('#')) break
    const next = idoc.getElementById(ref.slice(1))
    if (!next || chain.includes(next) || !/gradient$/i.test(next.localName)) break
    chain.push(next)
    cur = next
  }
  return chain
}

/** `value` → number; percentages become fractions (objectBoundingBox) or scale against `userBase`. */
function length(value: string | null, fallback: number, userBase: number | null): number {
  if (value === null || value.trim() === '') return fallback
  const v = value.trim()
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return fallback
  if (v.endsWith('%')) return userBase === null ? n / 100 : (n / 100) * userBase
  return n
}

function transformOf(el: Element): M {
  const gt = (el as SVGGradientElement).gradientTransform?.baseVal
  const m = gt && gt.numberOfItems > 0 ? gt.consolidate()?.matrix : null
  return m ? [m.a, m.b, m.c, m.d, m.e, m.f] : IDENTITY
}

function stopsOf(chain: Element[], ctx: GradientCtx): GradientStop[] {
  const owner = chain.find((e) => Array.from(e.children).some((c) => c.localName === 'stop'))
  if (!owner) return []
  const out: GradientStop[] = []
  let last = 0
  for (const stop of Array.from(owner.children).filter((c) => c.localName === 'stop')) {
    const raw = stop.getAttribute('offset') ?? '0'
    let offset = raw.trim().endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw)
    if (!Number.isFinite(offset)) offset = 0
    offset = Math.min(1, Math.max(last, offset)) // offsets never go backwards
    last = offset

    const cs = ctx.win.getComputedStyle(stop)
    const css = cs.stopColor.toLowerCase() === 'currentcolor' ? cs.color : cs.stopColor
    const c = parseColor(css)
    if (!c) {
      ctx.note('unrecognised colour')
      continue
    }
    const stopOpacity = parseFloat(cs.stopOpacity)
    out.push({
      offset,
      color: formatColor({ ...c, a: c.a * (Number.isFinite(stopOpacity) ? stopOpacity : 1) * ctx.opacity }),
    })
  }
  return out
}

/** Resolve `url(#id)` to a Paint in the painted element's own coordinate space. */
export function resolveGradient(id: string, ctx: GradientCtx): GradientResult {
  const target = ctx.idoc.getElementById(id)
  if (!target) return { kind: 'missing' }
  const tag = target.localName
  if (tag === 'pattern') return { kind: 'unsupported', what: 'pattern fill' }
  if (tag !== 'linearGradient' && tag !== 'radialGradient') return { kind: 'missing' }

  const chain = chainOf(target, ctx.idoc)
  const attr = (name: string) => chain.find((e) => e.hasAttribute(name))?.getAttribute(name) ?? null
  const stops = stopsOf(chain, ctx)
  if (stops.length === 0) return { kind: 'paint', paint: null }
  if (stops.length === 1) return { kind: 'paint', paint: { type: 'solid', color: stops[0].color } }

  const obb = attr('gradientUnits') !== 'userSpaceOnUse'
  const { bbox, viewBox } = ctx
  if (obb && (bbox.width <= 0 || bbox.height <= 0)) return { kind: 'paint', paint: null } // per spec: not rendered

  const gtOwner = chain.find((e) => e.hasAttribute('gradientTransform'))
  const full: M = mul(obb ? [bbox.width, 0, 0, bbox.height, bbox.x, bbox.y] : IDENTITY, gtOwner ? transformOf(gtOwner) : IDENTITY)

  const sx = Math.hypot(full[0], full[1])
  const sy = Math.hypot(full[2], full[3])
  const skew = sx && sy ? Math.abs((full[0] * full[2] + full[1] * full[3]) / (sx * sy)) : 0
  const similarity = Math.abs(sx - sy) <= 0.01 * Math.max(sx, sy) && skew <= 0.01
  const axisAligned = Math.abs(full[1]) < 1e-9 && Math.abs(full[2]) < 1e-9

  const spread = attr('spreadMethod')
  if (spread === 'reflect' || spread === 'repeat') ctx.note('gradient spread (shown as pad)')

  const base = (axis: 'x' | 'y' | 'r') =>
    obb ? null : axis === 'x' ? viewBox.width : axis === 'y' ? viewBox.height : Math.sqrt((viewBox.width ** 2 + viewBox.height ** 2) / 2)

  if (tag === 'linearGradient') {
    const x1 = length(attr('x1'), 0, base('x'))
    const y1 = length(attr('y1'), 0, base('y'))
    const x2 = length(attr('x2'), obb ? 1 : base('x')!, base('x'))
    const y2 = length(attr('y2'), 0, base('y'))
    // Konva draws isolines perpendicular to the gradient vector. A transform
    // keeps that true only for similarity transforms, or when nothing rotates
    // and the vector is axis-aligned.
    const exact = similarity || (axisAligned && (x1 === x2 || y1 === y2))
    if (!exact) ctx.note('gradient approximated')
    const a = pt(full, x1, y1)
    const b = pt(full, x2, y2)
    return { kind: 'paint', paint: { type: 'linear', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stops } }
  }

  const cx = length(attr('cx'), obb ? 0.5 : base('x')! / 2, base('x'))
  const cy = length(attr('cy'), obb ? 0.5 : base('y')! / 2, base('y'))
  const r = length(attr('r'), obb ? 0.5 : base('r')! / 2, base('r'))
  const fx = length(attr('fx'), cx, base('x'))
  const fy = length(attr('fy'), cy, base('y'))
  // A circle becomes an ellipse under non-uniform scale/skew; Konva only has circles.
  if (!similarity) ctx.note('gradient approximated')
  const c = pt(full, cx, cy)
  const f = pt(full, fx, fy)
  const det = Math.abs(full[0] * full[3] - full[1] * full[2])
  return { kind: 'paint', paint: { type: 'radial', cx: c.x, cy: c.y, r: r * Math.sqrt(det), fx: f.x, fy: f.y, stops } }
}
