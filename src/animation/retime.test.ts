import { describe, expect, it } from 'vitest'
import type { LayerAnimation, TimelineConfig } from '../types/poster'
import { createAnimation } from './presets'
import { MIN_ANIM_SEC, fitToBars, retime, rulerStep, snapTime } from './retime'
import { animationWindow, contextFor } from './timing'

const tl = (extra: Partial<TimelineConfig> = {}): TimelineConfig => ({
  durationSec: 8,
  fps: 30,
  loop: true,
  ...extra,
})
const ctx = contextFor(tl(), false)
// 120 BPM → 0.5s beats, 2s bars.
const beatCtx = contextFor(tl({ bpm: 120 }), false)

const inAnim = (delay: number, duration: number): LayerAnimation => ({
  ...createAnimation('fade', 'in', 'a'),
  delay,
  duration,
})
const outAnim = (endOffset: number, duration: number): LayerAnimation => ({
  ...createAnimation('fade', 'out', 'b'),
  endOffset,
  duration,
})

describe('snapTime', () => {
  it('snaps to beats only with a BPM and when asked', () => {
    expect(snapTime(1.3, beatCtx, true)).toBe(1.5)
    expect(snapTime(1.3, beatCtx, false)).toBe(1.3)
    expect(snapTime(1.234, ctx, true)).toBe(1.23)
  })
})

describe('retime', () => {
  it('moves an in bar, keeping its length', () => {
    expect(retime(inAnim(1, 2), 'move', 0.5, ctx, false)).toEqual({ delay: 1.5, duration: 2 })
  })

  it('keeps a moved bar inside the timeline', () => {
    expect(retime(inAnim(1, 2), 'move', -5, ctx, false)).toEqual({ delay: 0, duration: 2 })
    expect(retime(inAnim(1, 2), 'move', 50, ctx, false)).toEqual({ delay: 6, duration: 2 })
    expect(retime(outAnim(1, 2), 'move', 5, ctx, false)).toEqual({ endOffset: 0, duration: 2 })
    expect(retime(outAnim(1, 2), 'move', -50, ctx, false)).toEqual({ endOffset: 6, duration: 2 })
  })

  it('dragging the start edge keeps the end fixed', () => {
    expect(retime(inAnim(1, 2), 'start', 0.5, ctx, false)).toEqual({ delay: 1.5, duration: 1.5 })
    // Out is anchored to the end, so only its duration changes.
    expect(retime(outAnim(1, 2), 'start', -1, ctx, false)).toEqual({ endOffset: 1, duration: 3 })
  })

  it('dragging the end edge keeps the start fixed', () => {
    expect(retime(inAnim(1, 2), 'end', 1, ctx, false)).toEqual({ delay: 1, duration: 3 })
    expect(retime(outAnim(1, 2), 'end', 0.5, ctx, false)).toEqual({ endOffset: 0.5, duration: 2.5 })
  })

  it('never collapses below the minimum length', () => {
    expect(retime(inAnim(1, 2), 'start', 10, ctx, false).duration).toBe(MIN_ANIM_SEC)
    expect(retime(inAnim(1, 2), 'end', -10, ctx, false).duration).toBe(MIN_ANIM_SEC)
    expect(retime(outAnim(1, 2), 'end', -10, ctx, false).duration).toBe(MIN_ANIM_SEC)
  })

  it('snaps the dragged edge to beats', () => {
    expect(retime(inAnim(0, 1), 'end', 0.3, beatCtx, true)).toEqual({ delay: 0, duration: 1.5 })
    expect(retime(inAnim(0, 1), 'move', 0.2, beatCtx, true)).toEqual({ delay: 0, duration: 1 })
    expect(retime(inAnim(0, 1), 'move', 0.3, beatCtx, true)).toEqual({ delay: 0.5, duration: 1 })
  })

  it('snaps the anchored (end) edge when moving an out', () => {
    const p = retime(outAnim(0, 1.2), 'move', -0.8, beatCtx, true)
    const w = animationWindow({ ...outAnim(0, 1.2), ...p }, beatCtx)
    expect(w.end).toBe(7) // 8 - 0.8 = 7.2 → nearest beat 7
    expect(p.duration).toBe(1.2)
  })

  it('round-trips: the stored patch reproduces the dragged window', () => {
    const a = outAnim(0.7, 1.3)
    const p = retime(a, 'start', -0.4, ctx, false)
    const w = animationWindow({ ...a, ...p }, ctx)
    expect(w.start).toBeCloseTo(8 - 0.7 - 1.3 - 0.4, 9)
    expect(w.end).toBeCloseTo(8 - 0.7, 9)
  })
})

describe('fitToBars', () => {
  it('rounds to the nearest whole bar, at least one', () => {
    expect(fitToBars(5, 120, 4)).toBe(6) // 2.5 bars → 3 bars
    expect(fitToBars(4.9, 120, 4)).toBe(4)
    expect(fitToBars(0.5, 120, 4)).toBe(2)
    expect(fitToBars(10, 90, 3)).toBe(10) // 2s bars: 5 bars
  })
})

describe('rulerStep', () => {
  it('picks the smallest step that leaves room for labels', () => {
    expect(rulerStep(100)).toBe(0.5)
    expect(rulerStep(50)).toBe(1)
    expect(rulerStep(10)).toBe(5)
  })
})
