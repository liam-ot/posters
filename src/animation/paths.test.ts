import { describe, expect, it } from 'vitest'
import type { Layer, LayerAnimation, ShapeLayer, SvgLayer, TimelineConfig, VectorPath } from '../types/poster'
import { dashCoverage, patternLength, revealDash } from './dash'
import { evaluateLayer } from './evaluate'
import { PRESETS, createAnimation, hasPathPresets, presetsFor } from './presets'
import { orderRanks, staggerProgress } from './stagger'
import { contextFor } from './timing'
import { identityPathFrame, type PathFrame, type PathInfo } from './types'
import { displaceSegments, normalizePath, preparedSegments, subdivide } from './wobble'
import { applyPathFrames, isIdentityPathFrame, paintWithAlpha } from '../render/pathFrames'

// ── dash reveal ────────────────────────────────────────────────────────────

type Iv = [number, number]
const EPS = 1e-6
const merge = (ivs: Iv[]): Iv[] => {
  const s = ivs.map((i) => [...i] as Iv).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const out: Iv[] = []
  for (const iv of s) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1] + EPS) last[1] = Math.max(last[1], iv[1])
    else out.push(iv)
  }
  return out
}
const close = (a: Iv[], b: Iv[]) => {
  expect(a).toHaveLength(b.length)
  a.forEach((iv, i) => {
    expect(iv[0]).toBeCloseTo(b[i][0], 4)
    expect(iv[1]).toBeCloseTo(b[i][1], 4)
  })
}

/** What *should* be visible: the resting pattern, kept by the pop/grow rule. */
function expectedCoverage(pattern: number[], offset: number, reveal: number, total: number, pop: boolean): Iv[] {
  const out: Iv[] = []
  for (const [lo, hi] of dashCoverage(pattern, offset, total)) {
    if (lo >= reveal - EPS) continue
    out.push([lo, pop ? hi : Math.min(hi, reveal)])
  }
  return merge(out)
}

describe('revealDash', () => {
  it('solid stroke: one dash of the revealed length, then a gap past the end', () => {
    expect(revealDash(undefined, 0, 30, 100, true)).toEqual({ dash: [30, 101], offset: 0, visible: true })
  })

  it('nothing is drawn at zero reveal; everything at full reveal (the plain pattern comes back)', () => {
    expect(revealDash([4, 6], 3, 0, 100, true).visible).toBe(false)
    expect(revealDash(undefined, 0, 100, 100, true)).toEqual({ dash: undefined, offset: 0, visible: true })
    expect(revealDash([4, 6], 3, 100, 100, true)).toEqual({ dash: [4, 6], offset: 3, visible: true })
    // so the final frame of a draw-on is exactly the resting stroke
    expect(revealDash([4, 6], 3, 100.0000001, 100, false).dash).toEqual([4, 6])
  })

  const patterns: [string, number[]][] = [
    ['dashed', [4, 6]],
    ['long-short', [10, 5, 2, 5]],
    ['dotted (zero-length dots)', [0, 8]],
    ['odd length (repeats)', [3, 3, 3]],
    ['fine dots', [1, 1.6]],
  ]
  const offsets = [0, 3, 7.5, -4, 25, 103]

  for (const [name, pattern] of patterns) {
    for (const pop of [true, false]) {
      it(`${name}: reveals exactly the resting pattern's dashes (${pop ? 'pop' : 'grow'}), for every offset and reveal length`, () => {
        const total = 100
        for (const offset of offsets) {
          for (let reveal = 1; reveal < total; reveal += 6.3) {
            const r = revealDash(pattern, offset, reveal, total, pop)
            const want = expectedCoverage(pattern, offset, reveal, total, pop)
            if (want.length === 0) {
              expect(r.visible, `${name} off ${offset} rev ${reveal}`).toBe(false)
              continue
            }
            expect(r.visible).toBe(true)
            close(merge(dashCoverage(r.dash, r.offset, total)), want)
          }
        }
      })
    }
  }

  it('is a prefix: revealing more never removes anything already shown (pop)', () => {
    const pattern = [4, 6]
    let prev: Iv[] = []
    for (let reveal = 1; reveal < 100; reveal += 1.7) {
      const r = revealDash(pattern, 3, reveal, 100, true)
      const cov = r.visible ? merge(dashCoverage(r.dash, r.offset, 100)) : []
      for (const [a, b] of prev) {
        expect(cov.some(([c, d]) => c <= a + EPS && d >= b - EPS)).toBe(true)
      }
      prev = cov
    }
  })

  it('never invents zero-length dashes (they draw stray dots with round caps) and ends in a gap past the path end', () => {
    for (const offset of offsets) {
      for (let reveal = 2; reveal < 100; reveal += 5.1) {
        const r = revealDash([4, 6], offset, reveal, 100, false)
        if (!r.dash) continue
        expect(r.dash.every((x) => x > 0), `${offset}/${reveal}: ${r.dash}`).toBe(true)
        expect(r.dash.length % 2).toBe(0)
        expect(r.dash[r.dash.length - 1]).toBeGreaterThanOrEqual(100)
        expect(patternLength(r.dash)).toBeGreaterThan(100)
      }
    }
  })

  it('keeps the pattern’s own zero-length dots (they are the dots)', () => {
    const r = revealDash([0, 8], 0, 20, 100, true)
    expect(r.dash!.filter((x, i) => i % 2 === 0 && x === 0).length).toBe(3) // dots at 0, 8, 16
  })

  it('a gap before the first dash becomes a negative offset', () => {
    const r = revealDash([4, 6], -6, 50, 100, true) // 6 units of gap first
    expect(r.offset).toBeCloseTo(-6)
    expect(r.dash![0]).toBe(4)
  })
})

// ── stagger ────────────────────────────────────────────────────────────────

const info = (cx: number, cy = 0, length = 100): PathInfo => ({ length, cx, cy })

describe('orderRanks', () => {
  const infos = [info(50, 30), info(10, 10), info(30, 20), info(20, 0)]
  it('document / reverse', () => {
    expect(orderRanks('document', infos, 1)).toEqual([0, 1, 2, 3])
    expect(orderRanks('reverse', infos, 1)).toEqual([3, 2, 1, 0])
  })
  it('left→right and top→bottom rank by centre, ties by drawing order', () => {
    expect(orderRanks('ltr', infos, 1)).toEqual([3, 0, 2, 1])
    expect(orderRanks('ttb', infos, 1)).toEqual([3, 1, 2, 0])
    expect(orderRanks('ltr', [info(5), info(5), info(1)], 1)).toEqual([1, 2, 0])
  })
  it('random is a seeded permutation', () => {
    const a = orderRanks('random', infos, 7)
    expect([...a].sort()).toEqual([0, 1, 2, 3])
    expect(orderRanks('random', infos, 7)).toEqual(a)
    expect(orderRanks('random', infos, 8)).not.toEqual(a)
  })
})

describe('staggerProgress', () => {
  it('stagger 0 animates everything together', () => {
    for (const r of [0, 3, 9]) expect(staggerProgress(0.4, r, 10, 0)).toBeCloseTo(0.4)
  })
  it('the first path starts at 0 and the last finishes exactly at 1, for any stagger', () => {
    for (const s of [0.1, 0.5, 1]) {
      const n = 6
      expect(staggerProgress(0, 0, n, s)).toBe(0)
      expect(staggerProgress(1e-9, 0, n, s)).toBeGreaterThan(0)
      expect(staggerProgress(1, n - 1, n, s)).toBe(1)
      expect(staggerProgress(1 - 1e-6, n - 1, n, s)).toBeLessThan(1)
    }
  })
  it('stagger 1 is strictly sequential', () => {
    const n = 4
    for (let i = 0; i < n - 1; i++) {
      expect(staggerProgress((i + 1) / n, i, n, 1)).toBeCloseTo(1) // path i done...
      expect(staggerProgress((i + 1) / n, i + 1, n, 1)).toBeCloseTo(0) // ...before i+1 starts
    }
  })
  it('is monotonic in u', () => {
    let last = 0
    for (let u = 0; u <= 1; u += 0.05) {
      const v = staggerProgress(u, 2, 5, 0.6)
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
  })
})

// ── wobble geometry ────────────────────────────────────────────────────────

describe('normalizePath', () => {
  it('converts relative, H/V, smooth, arc and close commands into absolute M/L/C/Q/Z', () => {
    const segs = normalizePath('M10 10 h 20 v 10 s 5 5 10 0 a 5 5 0 0 1 10 0 t 5 5 z')
    const kinds = segs.map((s) => s[0])
    expect(new Set(kinds)).toEqual(new Set(['M', 'L', 'C', 'Q', 'Z']))
    expect(segs[1]).toEqual(['L', 30, 10]) // h 20
    expect(segs[2]).toEqual(['L', 30, 20]) // v 10
  })
  it('makes the implicit closing edge explicit so it can bend', () => {
    expect(normalizePath('M0 0 L10 0 L10 10 Z')).toEqual([['M', 0, 0], ['L', 10, 0], ['L', 10, 10], ['L', 0, 0], ['Z']])
    expect(normalizePath('M0 0 L10 0 L0 0 Z')).toEqual([['M', 0, 0], ['L', 10, 0], ['L', 0, 0], ['Z']]) // already closed
  })
  it('returns nothing for garbage', () => {
    expect(normalizePath('')).toEqual([])
  })
})

describe('subdivide', () => {
  it('splits long lines and keeps the end points', () => {
    const out = subdivide([['M', 0, 0], ['L', 100, 0]], 25)
    expect(out).toHaveLength(5) // M + 4 pieces
    expect(out[out.length - 1]).toEqual(['L', 100, 0])
    expect(out[1]).toEqual(['L', 25, 0])
  })
  it('splits curves without changing where they start and end', () => {
    const out = subdivide([['M', 0, 0], ['C', 0, 50, 100, 50, 100, 0]], 30)
    expect(out.length).toBeGreaterThan(2)
    const last = out[out.length - 1]
    expect(last[0]).toBe('C')
    expect([last[5], last[6]]).toEqual([100, 0])
  })
  it('leaves short segments alone', () => {
    const segs = normalizePath('M0 0 L5 0 L5 5')
    expect(subdivide(segs, 50)).toEqual(segs)
  })
  it('caps the number of pieces', () => {
    expect(subdivide([['M', 0, 0], ['L', 1e6, 0]], 0.001).length).toBeLessThanOrEqual(65)
  })
})

describe('displaceSegments', () => {
  const sq = preparedSegments('M0 0 H100 V100 H0 Z', 25)
  it('a zero field reproduces the geometry', () => {
    expect(displaceSegments(sq, () => [0, 0])).toBe(displaceSegments(sq, () => [0, 0]))
    expect(displaceSegments(sq, () => [0, 0]).startsWith('M0 0L25 0')).toBe(true)
  })
  it('moves every point, including the former closing edge', () => {
    const d = displaceSegments(sq, (x) => [0, x === 0 ? 0 : 5])
    expect(d).toContain('L100 5') // an anchor moved
    expect(d.endsWith('Z')).toBe(true)
  })
  it('caches by data and spacing', () => {
    expect(preparedSegments('M0 0 H100 V100 H0 Z', 25)).toBe(sq)
    expect(preparedSegments('M0 0 H100 V100 H0 Z', 20)).not.toBe(sq)
  })
})

// ── applying frames to paths ───────────────────────────────────────────────

const vp = (over: Partial<VectorPath> = {}): VectorPath => ({
  id: 'p', d: 'M0 0 L100 0', transform: [1, 0, 0, 1, 0, 0], fill: null,
  stroke: { type: 'solid', color: '#ff0000' }, strokeWidth: 4, lineCap: 'butt', lineJoin: 'miter',
  miterLimit: 4, fillRule: 'nonzero', opacity: 1, visible: true, ...over,
})
const frame = (over: Partial<PathFrame> = {}): PathFrame => ({ ...identityPathFrame(), ...over })
const pinfo: PathInfo = { length: 100, cx: 50, cy: 0 }

describe('applyPathFrames', () => {
  it('returns the very same objects for an identity frame', () => {
    const paths = [vp()]
    expect(isIdentityPathFrame(frame())).toBe(true)
    expect(applyPathFrames(paths, [frame()], [pinfo])[0]).toBe(paths[0])
    expect(applyPathFrames(paths, undefined, [])).toBe(paths)
  })

  it('draw reveals the stroke by dash length; zero hides it', () => {
    const half = applyPathFrames([vp()], [frame({ draw: 0.5 })], [pinfo])[0]
    expect(half.dash).toEqual([50, 101])
    const none = applyPathFrames([vp()], [frame({ draw: 0 })], [pinfo])[0]
    expect(none.stroke).toBeNull()
  })

  it('draw on a dotted stroke reveals dots, not a solid line', () => {
    const dots = vp({ dash: [4, 6], lineCap: 'round' })
    const out = applyPathFrames([dots], [frame({ draw: 0.45 })], [pinfo])[0]
    // dashes start at 0, 10, 20, 30, 40 → five whole dashes pop in by 45
    expect(out.dash!.filter((_, i) => i % 2 === 0)).toEqual([4, 4, 4, 4, 4])
    const grown = applyPathFrames([dots], [frame({ draw: 0.45, dashMode: 'grow' })], [pinfo])[0]
    expect(grown.dash!.filter((_, i) => i % 2 === 0)).toEqual([4, 4, 4, 4, 4])
    const grown2 = applyPathFrames([dots], [frame({ draw: 0.43, dashMode: 'grow' })], [pinfo])[0]
    expect(grown2.dash!.filter((_, i) => i % 2 === 0).pop()).toBeCloseTo(3)
  })

  it('fill-only paths get a temporary outline in their own colour that thins to nothing', () => {
    const logo = vp({ stroke: null, strokeWidth: 0, fill: { type: 'solid', color: '#00ff00' } })
    const mid = applyPathFrames([logo], [frame({ draw: 0.5, outline: { width: 2 }, outlineFactor: 1 })], [pinfo])[0]
    expect(mid.stroke).toEqual({ type: 'solid', color: '#00ff00' })
    expect(mid.strokeWidth).toBe(2)
    expect(mid.dash).toEqual([50, 101])
    const thin = applyPathFrames([logo], [frame({ draw: 0.9, outline: { width: 2 }, outlineFactor: 0.25 })], [pinfo])[0]
    expect(thin.strokeWidth).toBeCloseTo(0.5)
    const done = applyPathFrames([logo], [frame({ outline: { width: 2 }, outlineFactor: 0 })], [pinfo])[0]
    expect(done).toBe(logo)
  })

  it('outline width is in layer px: divided by the path’s scale', () => {
    const logo = vp({ stroke: null, strokeWidth: 0, fill: { type: 'solid', color: '#00ff00' }, transform: [4, 0, 0, 4, 0, 0] })
    const out = applyPathFrames([logo], [frame({ draw: 0.5, outline: { width: 2 }, outlineFactor: 1 })], [pinfo])[0]
    expect(out.strokeWidth).toBeCloseTo(0.5)
  })

  it('fill opacity scales solid and gradient fills; opacity multiplies', () => {
    const g = paintWithAlpha(
      { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff80' }] }, 0.5)
    expect((g as { stops: { color: string }[] }).stops.map((s) => s.color)).toEqual(['#ff000080', '#0000ff40'])
    const out = applyPathFrames([vp({ fill: { type: 'solid', color: '#ff0000' }, opacity: 0.5 })], [frame({ fillOpacity: 0.5, opacity: 0.5 })], [pinfo])[0]
    expect(out.fill).toEqual({ type: 'solid', color: '#ff000080' })
    expect(out.opacity).toBeCloseTo(0.25)
  })

  it('rise translates in layer space', () => {
    const out = applyPathFrames([vp({ transform: [2, 0, 0, 2, 5, 6] })], [frame({ rise: 10 })], [pinfo])[0]
    expect(out.transform).toEqual([2, 0, 0, 2, 5, 16])
  })

  it('flow uses the path’s own pattern when it has one, else dash/gap × stroke width', () => {
    const own = applyPathFrames([vp({ dash: [4, 6] })], [frame({ flow: { phase: 0.5, dash: 3, gap: 2 } })], [pinfo])[0]
    expect(own.dash).toEqual([4, 6])
    expect(own.dashOffset).toBeCloseTo(5)
    const generic = applyPathFrames([vp()], [frame({ flow: { phase: -1, dash: 3, gap: 2 } })], [pinfo])[0]
    expect(generic.dash).toEqual([12, 8]) // × stroke width 4
    expect(generic.dashOffset).toBeCloseTo(-20)
  })

  it('flow and draw combine: the reveal respects the flowing pattern', () => {
    const out = applyPathFrames([vp({ dash: [4, 6] })], [frame({ draw: 0.5, flow: { phase: 0.3, dash: 3, gap: 2 } })], [pinfo])[0]
    const cov = merge(dashCoverage(out.dash, out.dashOffset ?? 0, 100))
    close(cov, expectedCoverage([4, 6], 3, 50, 100, true))
  })

  it('wobble moves the geometry; amount 0 leaves it alone', () => {
    const w = { amount: 6, size: 50, spacing: 20, cycle: 0.3, radius: 1.5, seed: 9 }
    const out = applyPathFrames([vp()], [frame({ wobble: w })], [pinfo])[0]
    expect(out.d).not.toBe('M0 0 L100 0')
    expect(applyPathFrames([vp()], [frame({ wobble: { ...w, amount: 0 } })], [pinfo])[0].d).toBe('M0 0 L100 0')
  })

  it('wobble is the same shape at the start and end of its loop, and differs mid-loop', () => {
    const w = { amount: 6, size: 50, spacing: 20, radius: 1.5, seed: 9 }
    const at = (cycle: number) => applyPathFrames([vp()], [frame({ wobble: { ...w, cycle } })], [pinfo])[0].d
    expect(at(0)).toBe(at(1))
    expect(at(0.5)).not.toBe(at(0))
  })

  it('wobble amount is in layer px even when the path is scaled', () => {
    const w = { amount: 6, size: 50, spacing: 20, cycle: 0.3, radius: 1.5, seed: 9 }
    const big = vp({ transform: [10, 0, 0, 10, 0, 0], d: 'M0 0 L10 0' })
    const out = applyPathFrames([big], [frame({ wobble: w })], [{ ...pinfo, length: 10 }])[0]
    const nums = out.d.match(/-?\d+\.?\d*/g)!.map(Number)
    // local displacement ≈ amount / scale = 0.6 at most (noise is within about ±1)
    expect(Math.max(...nums.filter((_, i) => i % 2 === 1).map(Math.abs))).toBeLessThan(1.5)
  })
})

// ── evaluator with path presets ────────────────────────────────────────────

const timeline: TimelineConfig = { durationSec: 5, fps: 30, loop: true }
const ctx = contextFor(timeline, false)
const rest = contextFor(timeline, true)
const shapeLayer = (animations: LayerAnimation[]): Layer =>
  ({ id: 'S1', name: 'S', type: 'shape', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, visible: true, locked: false,
     shape: 'star', params: {}, fill: '#fff', stroke: null, animations }) as ShapeLayer
const anim = (preset: LayerAnimation['preset'], phase: LayerAnimation['phase'], extra: Partial<LayerAnimation> = {}) =>
  ({ ...createAnimation(preset, phase, `${preset}-${phase}`), ...extra })
const infos3 = [info(10), info(50), info(90)]

describe('path presets', () => {
  it('only svg/shape layers are offered them', () => {
    expect(presetsFor('in', 'shape').map((p) => p.id)).toContain('drawOn')
    expect(presetsFor('in', 'svg').map((p) => p.id)).toContain('pathFade')
    expect(presetsFor('loop', 'shape').map((p) => p.id)).toEqual(expect.arrayContaining(['wobble', 'dashFlow']))
    for (const type of ['rect', 'text', 'image', undefined]) {
      const ids = presetsFor('in', type).map((p) => p.id).concat(presetsFor('loop', type).map((p) => p.id))
      expect(ids).not.toContain('drawOn')
      expect(ids).not.toContain('wobble')
    }
    expect(hasPathPresets(shapeLayer([anim('drawOn', 'in')]))).toBe(true)
    expect(hasPathPresets(shapeLayer([anim('fade', 'in')]))).toBe(false)
    expect(hasPathPresets(shapeLayer([{ ...anim('drawOn', 'in'), enabled: false }]))).toBe(false)
  })

  it('do nothing without measured paths (and never throw)', () => {
    const f = evaluateLayer(shapeLayer([anim('drawOn', 'in')]), 0, ctx)
    expect(f.paths).toBeUndefined()
  })

  it('rest state: every path fully drawn, opaque and still — for every path preset and phase', () => {
    for (const d of Object.values(PRESETS).filter((p) => p.appliesTo === 'paths')) {
      for (const phase of d.phases) {
        const f = evaluateLayer(shapeLayer([anim(d.id, phase)]), 1.7, rest, infos3)
        expect(f.paths).toHaveLength(3)
        for (const pf of f.paths!) expect(isIdentityPathFrame(pf), `${d.id} ${phase}`).toBe(true)
      }
    }
  })

  it('draw on: with stagger the first path finishes before the last begins; the last ends with the animation', () => {
    const l = shapeLayer([anim('drawOn', 'in', { delay: 0, duration: 2, easing: 'linear', params: { stagger: 1, fill: 'none', order: 'document' } })])
    const at = (t: number) => evaluateLayer(l, t, ctx, infos3).paths!.map((p) => +p.draw.toFixed(3))
    expect(at(0)).toEqual([0, 0, 0])
    expect(at(1 / 3 * 2)).toEqual([1, 0, 0])
    expect(at(2 * 2 / 3)).toEqual([1, 1, 0])
    expect(at(2)).toEqual([1, 1, 1])
    expect(at(4)).toEqual([1, 1, 1])
  })

  it('draw on honours the order (reverse starts with the last path)', () => {
    const l = shapeLayer([anim('drawOn', 'in', { duration: 2, easing: 'linear', params: { stagger: 1, fill: 'none', order: 'reverse' } })])
    expect(evaluateLayer(l, 2 / 3, ctx, infos3).paths!.map((p) => +p.draw.toFixed(3))).toEqual([0, 0, 1])
  })

  it('"fill after": the stroke finishes first, then the fill fades in; the outline thins away', () => {
    const l = shapeLayer([anim('drawOn', 'in', { duration: 1, easing: 'linear', params: { stagger: 0, fill: 'after', outline: true } })])
    const at = (t: number) => evaluateLayer(l, t, ctx, [info(0)]).paths![0]
    expect(at(0.35).draw).toBeCloseTo(0.5)
    expect(at(0.35).fillOpacity).toBe(0)
    expect(at(0.7).draw).toBeCloseTo(1)
    expect(at(0.85).fillOpacity).toBeCloseTo(0.5)
    expect(at(0.85).outlineFactor).toBeCloseTo(0.5)
    expect(at(1).fillOpacity).toBe(1)
    expect(at(1).outlineFactor).toBe(0)
  })

  it('draw-on out is the time-mirror of draw-on in', () => {
    const inn = shapeLayer([anim('drawOn', 'in', { duration: 2, easing: 'easeInOut', params: { stagger: 0.5 } })])
    const out = shapeLayer([anim('drawOn', 'out', { duration: 2, easing: 'easeInOut', params: { stagger: 0.5 }, endOffset: 0 })])
    for (const k of [0, 0.4, 1, 1.7, 2]) {
      const a = evaluateLayer(inn, k, ctx, infos3).paths!
      const b = evaluateLayer(out, ctx.duration - k, ctx, infos3).paths!
      a.forEach((pa, i) => {
        expect(b[i].draw).toBeCloseTo(pa.draw, 8)
        expect(b[i].fillOpacity).toBeCloseTo(pa.fillOpacity, 8)
      })
    }
  })

  it('in + out compose: draw takes the min, fill alpha multiplies', () => {
    const l = shapeLayer([
      anim('drawOn', 'in', { duration: 1, easing: 'linear', params: { stagger: 0, fill: 'with' } }),
      anim('drawOn', 'out', { duration: 1, endOffset: 0, easing: 'linear', params: { stagger: 0, fill: 'with' } }),
    ])
    const p = (t: number) => evaluateLayer(l, t, ctx, [info(0)]).paths![0]
    expect(p(0.5).draw).toBeCloseTo(0.5) // only the in is active
    expect(p(2.5).draw).toBe(1) // both finished/not started
    expect(p(4.5).draw).toBeCloseTo(0.5) // only the out is active
    expect(p(4.5).fillOpacity).toBeCloseTo(0.5)
  })

  it('fade paths: staggered opacity and rise', () => {
    const l = shapeLayer([anim('pathFade', 'in', { duration: 1, easing: 'linear', params: { stagger: 1, rise: 30 } })])
    const f = evaluateLayer(l, 0.5, ctx, infos3).paths!
    expect(f.map((p) => +p.opacity.toFixed(3))).toEqual([1, 0.5, 0])
    expect(f[1].rise).toBeCloseTo(15)
  })

  it('wobble and dash flow loop seamlessly (frame at 0 == frame at the end), across periods that divide the timeline', () => {
    // Compare every number in the per-path frames, with a tolerance for float noise.
    const flat = (v: unknown): number[] => (typeof v === 'number' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(flat) : [])
    for (const preset of ['wobble', 'dashFlow'] as const) {
      for (const period of [0.5, 1, 2.5, 5]) {
        const l = shapeLayer([anim(preset, 'loop', { period, periodUnit: 'sec' })])
        const a = flat(evaluateLayer(l, 0, ctx, infos3).paths)
        const b = flat(evaluateLayer(l, ctx.duration, ctx, infos3).paths)
        expect(a.length).toBeGreaterThan(0)
        expect(b).toHaveLength(a.length)
        a.forEach((x, i) => expect(b[i], `${preset} period ${period}`).toBeCloseTo(x, 9))
      }
    }
  })

  it('dash flow advances whole pattern lengths per loop and can run backwards', () => {
    const fwd = shapeLayer([anim('dashFlow', 'loop', { period: 2, params: { cycles: 3, direction: 'forward' } })])
    const back = shapeLayer([anim('dashFlow', 'loop', { period: 2, params: { cycles: 3, direction: 'backward' } })])
    expect(evaluateLayer(fwd, 1, ctx, infos3).paths![0].flow!.phase).toBeCloseTo(-1.5)
    expect(evaluateLayer(back, 1, ctx, infos3).paths![0].flow!.phase).toBeCloseTo(1.5)
  })

  it('wobble "boil" holds its shape between updates', () => {
    const l = shapeLayer([anim('wobble', 'loop', { period: 1, params: { step: 4 } })])
    const w = (t: number) => JSON.stringify(evaluateLayer(l, t, ctx, infos3).paths![0].wobble)
    expect(w(0.3)).toBe(w(0.4))
    expect(w(0.3)).not.toBe(w(0.6))
  })

  it('also works on svg layers', () => {
    const svg = { ...shapeLayer([anim('drawOn', 'in', { duration: 1 })]), type: 'svg' } as unknown as SvgLayer
    expect(evaluateLayer(svg, 0.2, ctx, infos3).paths).toHaveLength(3)
  })
})
