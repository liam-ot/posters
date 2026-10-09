import { describe, expect, it } from 'vitest'
import type { Layer, LayerAnimation, RectLayer, TimelineConfig } from '../types/poster'
import { EASINGS, ease } from './easing'
import { evaluateLayer, hasActiveAnimations } from './evaluate'
import { loopNoise } from './noise'
import { PRESET_LIST, PRESETS, createAnimation, presetsFor } from './presets'
import {
  contextFor,
  cycleOf,
  loopsSeamlessly,
  periodSeconds,
  animationWindow,
} from './timing'
import { animatedGroupConfig } from '../render/transform'

const timeline: TimelineConfig = { durationSec: 5, fps: 30, loop: true }
const ctx = contextFor(timeline, false)
const rest = contextFor(timeline, true)

const layer = (animations: LayerAnimation[]): Layer =>
  ({
    id: 'L1',
    name: 'L',
    type: 'rect',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: '#fff',
    animations,
  }) as RectLayer

const anim = (preset: LayerAnimation['preset'], phase: LayerAnimation['phase'], extra: Partial<LayerAnimation> = {}) => ({
  ...createAnimation(preset, phase, `${preset}-${phase}`),
  ...extra,
})

describe('easing', () => {
  it.each(Object.keys(EASINGS) as (keyof typeof EASINGS)[])('%s maps 0→0 and 1→1', (name) => {
    expect(ease(name, 0)).toBeCloseTo(0, 10)
    expect(ease(name, 1)).toBeCloseTo(1, 10)
  })

  it('clamps input outside 0..1', () => {
    expect(ease('easeOut', -1)).toBe(0)
    expect(ease('easeOut', 2)).toBe(1)
  })

  it('backOut overshoots 1', () => {
    expect(Math.max(...[...Array(100)].map((_, i) => ease('backOut', i / 99)))).toBeGreaterThan(1)
  })
})

describe('timing', () => {
  it('converts beat and bar periods using bpm', () => {
    const c = contextFor({ ...timeline, bpm: 120, beatsPerBar: 4 }, false)
    expect(periodSeconds(anim('pulse', 'loop', { period: 1, periodUnit: 'beat' }), c)).toBeCloseTo(0.5)
    expect(periodSeconds(anim('pulse', 'loop', { period: 2, periodUnit: 'bar' }), c)).toBeCloseTo(4)
  })

  it('reads beat units as seconds when no bpm is set', () => {
    expect(periodSeconds(anim('pulse', 'loop', { period: 2, periodUnit: 'beat' }), ctx)).toBe(2)
  })

  it('cycleOf wraps and lands on 0 at whole periods despite float error', () => {
    expect(cycleOf(0.25, 1)).toBeCloseTo(0.25)
    // float noise may leave ~1e-16 rather than exactly 0; it must never wrap to ~1
    for (const [t, period] of [[5, 0.5], [3, 1], [3, 0.1 * 10], [0.3 * 10, 0.3], [0.7 * 7, 0.7]]) {
      expect(cycleOf(t, period)).toBeCloseTo(0, 9)
    }
  })

  it('anchors out animations to the timeline end', () => {
    const w = animationWindow(anim('fade', 'out', { duration: 1, endOffset: 0.5 }), ctx)
    expect(w).toEqual({ start: 3.5, end: 4.5 })
  })

  it('knows when a loop divides the duration', () => {
    expect(loopsSeamlessly(1, 5)).toBe(true)
    expect(loopsSeamlessly(2.5, 5)).toBe(true)
    expect(loopsSeamlessly(2, 5)).toBe(false)
    expect(loopsSeamlessly(10, 5)).toBe(false)
  })
})

describe('presets registry', () => {
  it('offers only valid presets per phase', () => {
    expect(presetsFor('in').map((p) => p.id)).toContain('slide')
    expect(presetsFor('in').map((p) => p.id)).not.toContain('pulse')
    expect(presetsFor('loop').map((p) => p.id)).toContain('jitter')
    expect(presetsFor('out').map((p) => p.id)).not.toContain('spin')
  })

  it('every control has a default', () => {
    for (const d of PRESET_LIST) for (const c of d.controls) expect(d.defaults).toHaveProperty(c.key)
  })
})

describe('evaluateLayer', () => {
  it('is the identity with no animations', () => {
    expect(evaluateLayer(layer([]), 1, ctx)).toEqual({
      dx: 0, dy: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    })
    expect(hasActiveAnimations(layer([]))).toBe(false)
  })

  it('ignores disabled animations', () => {
    const l = layer([{ ...anim('fade', 'in'), enabled: false }])
    expect(hasActiveAnimations(l)).toBe(false)
    expect(evaluateLayer(l, 0, ctx).opacity).toBe(1)
  })

  it.each(PRESET_LIST.flatMap((d) => d.phases.map((p) => [d.id, p] as const)))(
    'rest state is the identity for %s (%s)',
    (preset, phase) => {
      const f = evaluateLayer(layer([anim(preset, phase)]), 1.7, rest)
      expect(f).toEqual({ dx: 0, dy: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 })
    },
  )

  it('in: hidden before it starts, at rest once finished', () => {
    const l = layer([anim('fade', 'in', { delay: 1, duration: 2, easing: 'linear' })])
    expect(evaluateLayer(l, 0, ctx).opacity).toBe(0)
    expect(evaluateLayer(l, 1, ctx).opacity).toBe(0)
    expect(evaluateLayer(l, 2, ctx).opacity).toBeCloseTo(0.5)
    expect(evaluateLayer(l, 3, ctx).opacity).toBe(1)
    expect(evaluateLayer(l, 5, ctx).opacity).toBe(1)
  })

  it('out: at rest until it starts, hidden once finished', () => {
    const l = layer([anim('fade', 'out', { duration: 1, endOffset: 0, easing: 'linear' })])
    expect(evaluateLayer(l, 3, ctx).opacity).toBe(1)
    expect(evaluateLayer(l, 4.5, ctx).opacity).toBeCloseTo(0.5)
    expect(evaluateLayer(l, 5, ctx).opacity).toBe(0)
  })

  it('out mirrors in (same preset and easing, time reversed)', () => {
    for (const easing of ['linear', 'easeOut', 'backOut', 'bounceOut'] as const) {
      const inn = layer([anim('slide', 'in', { delay: 0, duration: 2, easing })])
      const out = layer([anim('slide', 'out', { endOffset: 0, duration: 2, easing })])
      for (const k of [0, 0.3, 0.7, 1, 1.5, 2]) {
        const a = evaluateLayer(inn, k, ctx)
        const b = evaluateLayer(out, ctx.duration - k, ctx)
        expect(b.dy).toBeCloseTo(a.dy, 8)
        expect(b.opacity).toBeCloseTo(a.opacity, 8)
      }
    }
  })

  it('composes in + loop + out: translate adds, opacity multiplies', () => {
    const l = layer([
      anim('slide', 'in', { duration: 1, easing: 'linear', params: { from: 'bottom', distance: 100, fade: true } }),
      anim('float', 'loop', { period: 2.5, params: { distance: 10, axis: 'y' } }),
      anim('fade', 'out', { duration: 1, easing: 'linear' }),
    ])
    const f = evaluateLayer(l, 0.5, ctx)
    // slide at p=.5 → dy +50; float at cycle .2 → 10·sin(2π·.2)
    expect(f.dy).toBeCloseTo(50 + 10 * Math.sin(2 * Math.PI * 0.2), 6)
    expect(f.opacity).toBeCloseTo(0.5)
    expect(evaluateLayer(l, 4.5, ctx).opacity).toBeCloseTo(0.5)
  })

  it('scale never goes negative (back easing overshoot)', () => {
    const l = layer([anim('scale', 'out', { duration: 2, easing: 'backOut', params: { from: 0 } })])
    for (let t = 3; t <= 5; t += 0.05) expect(evaluateLayer(l, t, ctx).scaleX).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic', () => {
    const l = layer([anim('jitter', 'loop', { period: 1 })])
    expect(evaluateLayer(l, 1.234, ctx)).toEqual(evaluateLayer(l, 1.234, ctx))
  })

  it('jitter differs between layers (seeded by id)', () => {
    const a = layer([anim('jitter', 'loop')])
    const b = { ...layer([anim('jitter', 'loop')]), id: 'L2' } as Layer
    expect(evaluateLayer(a, 0.37, ctx).dx).not.toBe(evaluateLayer(b, 0.37, ctx).dx)
  })

  it('jitter with steps holds its value between updates', () => {
    const l = layer([anim('jitter', 'loop', { period: 1, params: { step: 4 } })])
    expect(evaluateLayer(l, 0.3, ctx)).toEqual(evaluateLayer(l, 0.4, ctx)) // same quarter-second step
    expect(evaluateLayer(l, 0.3, ctx)).not.toEqual(evaluateLayer(l, 0.6, ctx))
  })
})

describe('seamless loops (adr-0004)', () => {
  const loops = PRESET_LIST.filter((d) => d.phases.includes('loop'))
  // periods that divide the 5s timeline
  for (const period of [0.5, 1, 2.5, 5]) {
    it.each(loops.map((d) => d.id))(`%s: frame at t=0 equals frame at t=duration (period ${period}s)`, (id) => {
      const l = layer([anim(id, 'loop', { period, periodUnit: 'sec' })])
      const a = evaluateLayer(l, 0, ctx)
      const b = evaluateLayer(l, ctx.duration, ctx)
      for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k]).toBeCloseTo(a[k], 6)
    })
  }

  it('also holds for beat-based periods', () => {
    const c = contextFor({ ...timeline, bpm: 120, beatsPerBar: 4 }, false) // 0.5s beats, 2s bars
    const l = layer([anim('jitter', 'loop', { period: 1, periodUnit: 'beat', params: { step: 8 } })])
    expect(evaluateLayer(l, 5, c)).toEqual(evaluateLayer(l, 0, c))
  })

  it('looping noise returns to its start after one cycle', () => {
    for (const ch of [0, 1, 2]) {
      expect(loopNoise(42, ch, 1, 3)).toBeCloseTo(loopNoise(42, ch, 0, 3), 9)
    }
  })

  it('PRESETS lookup covers every id', () => {
    for (const d of PRESET_LIST) expect(PRESETS[d.id]).toBe(d)
  })
})

describe('animatedGroupConfig (adr-0003)', () => {
  it('is a no-op transform for an identity frame', () => {
    const c = animatedGroupConfig({ width: 200, height: 100 })
    // position − offset = 0, so children land exactly where they did before
    expect(c.x! - c.offsetX!).toBe(0)
    expect(c.y! - c.offsetY!).toBe(0)
    expect(c).toMatchObject({ rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 })
  })

  it('pivots around the layer centre', () => {
    const c = animatedGroupConfig(
      { width: 200, height: 100 },
      { dx: 5, dy: -3, rotation: 30, scaleX: 2, scaleY: 2, opacity: 0.5 },
    )
    expect(c).toMatchObject({ x: 105, y: 47, offsetX: 100, offsetY: 50, rotation: 30, scaleX: 2, opacity: 0.5 })
  })
})
