import { describe, expect, it } from 'vitest'
import { contextFor } from '../animation/timing'
import type { TimelineConfig } from '../types/poster'
import { normalizeAsset } from './normalize'
import { PIN_PRESET_LIST } from './pinPresets'
import { evaluatePins, instancePins, motionAnimates, poseWeight } from './pins'
import type { PinAnimation, PuppetAsset, PuppetMotion } from './types'

const timeline = (bpm?: number): TimelineConfig => ({ durationSec: 4, fps: 30, loop: true, bpm })
const ctx = contextFor(timeline(120), false) // 0.5 s beats
const rest = contextFor(timeline(120), true)

const loop = (preset: PinAnimation['preset'], params: PinAnimation['params'] = {}, extra: Partial<PinAnimation> = {}): PinAnimation => ({
  id: preset,
  preset,
  enabled: true,
  period: 2,
  periodUnit: 'beat',
  params,
  ...extra,
})

function asset(motion: Partial<PuppetMotion>, pinsExtra: Record<string, { parent?: string }> = {}): PuppetAsset {
  return normalizeAsset({
    id: 'a',
    name: 'A',
    size: { width: 400, height: 300 },
    source: { viewBox: { x: 0, y: 0, width: 400, height: 300 }, paths: [] },
    puppet: {
      detail: 100,
      pins: [
        { id: 'body', kind: 'pin', at: [200, 150] },
        { id: 'shoulder', kind: 'pin', at: [150, 120], ...pinsExtra.shoulder },
        { id: 'hand', kind: 'pin', at: [100, 120], ...pinsExtra.hand },
      ],
    },
    motions: [{ id: 'm', name: 'Dance', animations: {}, ...motion }],
  } as unknown as PuppetAsset)
}

const close = (a: number[], b: number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))

describe('poseWeight', () => {
  it.each(['smooth', 'pop', 'hit'] as const)('%s starts in the motion pose', (shape) => {
    expect(poseWeight(shape, 0)).toBeCloseTo(1, 9)
  })
  it('smooth and pop reach the base pose half way', () => {
    expect(poseWeight('smooth', 0.5)).toBeCloseTo(0, 9)
    expect(poseWeight('pop', 0.5)).toBeCloseTo(0, 9)
    expect(poseWeight('pop', 0.25)).toBe(1)
    expect(poseWeight('pop', 0.75)).toBe(0)
  })
})

describe('pose loop', () => {
  const a = asset({ poses: { hand: [100, 40] } })

  it('rocks between the motion pose and the base pose', () => {
    // 2-beat period at 120 BPM = 1 s.
    close(evaluatePins(a, 'm', 0, ctx).get('hand')!, [100, 40])
    close(evaluatePins(a, 'm', 0.5, ctx).get('hand')!, [100, 120])
    close(evaluatePins(a, 'm', 0.25, ctx).get('hand')!, [100, 80])
    // Pins without a motion pose stay at their base.
    close(evaluatePins(a, 'm', 0.25, ctx).get('body')!, [200, 150])
  })

  it('is seamless across the timeline', () => {
    close(evaluatePins(a, 'm', 4, ctx).get('hand')!, evaluatePins(a, 'm', 0, ctx).get('hand')!)
  })

  it('rest state shows the motion pose', () => {
    close(evaluatePins(a, 'm', 0.5, rest).get('hand')!, [100, 40])
  })

  it('switched off, the motion just holds its pose', () => {
    const still = asset({ poses: { hand: [100, 40] }, poseLoop: { enabled: false, shape: 'smooth', period: 2, periodUnit: 'beat' } })
    close(evaluatePins(still, 'm', 0.5, ctx).get('hand')!, [100, 40])
    expect(motionAnimates(still, 'm')).toBe(false)
  })

  it('follows the poster BPM', () => {
    const slow = contextFor(timeline(60), false) // 1 s beats → 2 s period
    close(evaluatePins(a, 'm', 1, slow).get('hand')!, [100, 120])
  })
})

describe('pin loops and chains', () => {
  it.each(PIN_PRESET_LIST.map((d) => d.id))('%s is seamless and neutral at the start of a cycle', (id) => {
    const parented = { hand: { parent: 'shoulder' } }
    const a = asset({ animations: { hand: [loop(id)] } }, parented)
    const at0 = evaluatePins(a, 'm', 0, ctx).get('hand')!
    close(evaluatePins(a, 'm', 4, ctx).get('hand')!, at0)
    if (id !== 'bounce') close(at0, [100, 120]) // bounce hits on the beat by design
    expect(evaluatePins(a, 'm', 0.37, ctx).get('hand')).not.toEqual(at0)
  })

  it('swing rotates a pin around its parent', () => {
    const a = asset({ animations: { hand: [loop('swing', { angle: 90 })] } }, { hand: { parent: 'shoulder' } })
    // Quarter cycle: sin = 1 → +90°. Offset (-50, 0) rotated 90° → (0, -50).
    close(evaluatePins(a, 'm', 0.25, ctx).get('hand')!, [150, 70])
  })

  it('swing does nothing without a parent', () => {
    const a = asset({ animations: { hand: [loop('swing', { angle: 90 })] } })
    close(evaluatePins(a, 'm', 0.25, ctx).get('hand')!, [100, 120])
  })

  it('a child follows its parent’s translation and rotation', () => {
    const a = asset(
      { animations: { shoulder: [loop('swing', { angle: 90 }), loop('bob', { distance: 10, direction: 90 })] } },
      { shoulder: { parent: 'body' }, hand: { parent: 'shoulder' } },
    )
    const t = 0.25
    const s = evaluatePins(a, 'm', t, ctx).get('shoulder')!
    const h = evaluatePins(a, 'm', t, ctx).get('hand')!
    // Hand keeps its distance from the shoulder, rotated with it: offset (-50, 0) → (0, -50).
    close([h[0] - s[0], h[1] - s[1]], [0, -50])
  })

  it('ignores a parent link that would make a cycle', () => {
    const a = asset({ animations: { hand: [loop('bob', { distance: 10 })] } }, { shoulder: { parent: 'hand' }, hand: { parent: 'shoulder' } })
    expect(() => evaluatePins(a, 'm', 0.3, ctx)).not.toThrow()
    expect(evaluatePins(a, 'm', 0.3, ctx).size).toBe(3)
  })

  it('phase offset ½ = half a period later', () => {
    const a = asset({ animations: { hand: [loop('bob', { distance: 10 })] } })
    const b = asset({ animations: { hand: [loop('bob', { distance: 10 }, { phaseOffset: 0.5 })] } })
    close(evaluatePins(b, 'm', 0.1, ctx).get('hand')!, evaluatePins(a, 'm', 0.6, ctx).get('hand')!)
  })

  it('rest state turns pin loops off', () => {
    const a = asset({ animations: { hand: [loop('bob', { distance: 10 })] } })
    close(evaluatePins(a, 'm', 0.25, rest).get('hand')!, [100, 120])
  })
})

describe('instancePins', () => {
  it('is undefined for still motions and rest state, so the cached pose is used', () => {
    const a = asset({})
    expect(instancePins({ snapshot: a, motionId: 'm' }, 1, ctx)).toBeUndefined()
    expect(instancePins({ snapshot: a }, 1, ctx)).toBeUndefined()
    const moving = asset({ poses: { hand: [0, 0] } })
    expect(instancePins({ snapshot: moving, motionId: 'm' }, 1, rest)).toBeUndefined()
    expect(instancePins({ snapshot: moving, motionId: 'm' }, 1, ctx)).toBeInstanceOf(Map)
  })
})
