import type { LayerAnimation, TimelineConfig } from '../types/poster'

/** Timeline facts the evaluator needs. `rest` = show the final, un-animated state. */
export interface EvalContext {
  duration: number
  bpm?: number
  beatsPerBar: number
  rest: boolean
}

export function contextFor(timeline: TimelineConfig, rest: boolean): EvalContext {
  return {
    duration: timeline.durationSec,
    bpm: timeline.bpm && timeline.bpm > 0 ? timeline.bpm : undefined,
    beatsPerBar: timeline.beatsPerBar && timeline.beatsPerBar > 0 ? timeline.beatsPerBar : 4,
    rest,
  }
}

export const secPerBeat = (bpm: number) => 60 / bpm

/** Loop period in seconds. Beat/bar units need a BPM; without one they read as seconds. */
export function periodSeconds(a: LayerAnimation, ctx: EvalContext): number {
  const period = Math.max(0.01, a.period ?? 1)
  if (!ctx.bpm || a.periodUnit === undefined || a.periodUnit === 'sec') return period
  const beat = secPerBeat(ctx.bpm)
  return a.periodUnit === 'beat' ? period * beat : period * beat * ctx.beatsPerBar
}

/** Time as a loop sees it: shifted by its phase offset (a fraction of the period). */
export function loopTime(a: LayerAnimation, t: number, period: number): number {
  return t + (a.phaseOffset ?? 0) * period
}

/**
 * Position in a cycle, 0..1. Tolerates float error so a time that is a whole
 * number of periods (e.g. the timeline end) lands exactly on 0 — that's what
 * makes loops seamless (docs/adr/0004).
 */
export function cycleOf(t: number, period: number): number {
  const x = t / period
  return Math.max(0, x - Math.floor(x + 1e-9))
}

/** [start, end] in seconds of an in/out animation. */
export function animationWindow(
  a: LayerAnimation,
  ctx: EvalContext,
): { start: number; end: number } {
  const dur = Math.max(0, a.duration ?? 1)
  if (a.phase === 'out') {
    const end = ctx.duration - Math.max(0, a.endOffset ?? 0)
    return { start: end - dur, end }
  }
  const start = Math.max(0, a.delay ?? 0)
  return { start, end: start + dur }
}

/** Does a loop of this period repeat a whole number of times in the timeline? */
export function loopsSeamlessly(periodSec: number, duration: number): boolean {
  const n = duration / periodSec
  return n >= 1 - 1e-6 && Math.abs(n - Math.round(n)) < 1e-6
}
