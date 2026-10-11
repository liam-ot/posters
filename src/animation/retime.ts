import type { LayerAnimation } from '../types/poster'
import { animationWindow, secPerBeat, type EvalContext } from './timing'

/** Which part of an in/out bar is being dragged in the timeline panel. */
export type DragMode = 'move' | 'start' | 'end'

/** Shortest in/out window a drag can produce, seconds. */
export const MIN_ANIM_SEC = 0.05

const round = (x: number) => Math.round(x * 1000) / 1000

/**
 * Snap a time to the beat grid when a BPM is set; otherwise to 0.01s so the
 * Inspector shows tidy numbers.
 */
export function snapTime(t: number, ctx: EvalContext, toBeats: boolean): number {
  if (toBeats && ctx.bpm) {
    const beat = secPerBeat(ctx.bpm)
    return round(Math.round(t / beat) * beat)
  }
  return Math.round(t * 100) / 100
}

/**
 * New timing for an in/out animation after dragging part of its bar by `dt`
 * seconds (relative to the bar as it was when the drag began). The edge being
 * dragged snaps; for a move, the anchored edge snaps (start for in, end for
 * out) so the length is preserved. The window stays inside the timeline.
 * Returns the patch to store — in keeps `delay`, out keeps `endOffset`
 * (docs/adr/0005).
 */
export function retime(
  a: LayerAnimation,
  mode: DragMode,
  dt: number,
  ctx: EvalContext,
  toBeats: boolean,
): Pick<LayerAnimation, 'delay' | 'endOffset' | 'duration'> {
  const D = ctx.duration
  const w = animationWindow(a, ctx)
  const len = w.end - w.start
  const snap = (t: number) => snapTime(t, ctx, toBeats)
  let start = w.start
  let end = w.end

  if (mode === 'move') {
    if (a.phase === 'out') {
      end = Math.min(D, Math.max(len, snap(w.end + dt)))
      start = end - len
    } else {
      start = Math.max(0, Math.min(D - len, snap(w.start + dt)))
      end = start + len
    }
  } else if (mode === 'start') {
    start = Math.max(0, Math.min(end - MIN_ANIM_SEC, snap(w.start + dt)))
  } else {
    end = Math.min(D, Math.max(start + MIN_ANIM_SEC, snap(w.end + dt)))
  }

  const duration = round(end - start)
  return a.phase === 'out'
    ? { endOffset: round(Math.max(0, D - end)), duration }
    : { delay: round(Math.max(0, start)), duration }
}

/** Duration rounded to the nearest whole number of bars (at least one). */
export function fitToBars(durationSec: number, bpm: number, beatsPerBar: number): number {
  const bar = secPerBeat(bpm) * beatsPerBar
  // Exact, not rounded to the millisecond: at 90 BPM a bar is 2.666…s, and a
  // rounded length would leave loops a hair out of step at the wrap.
  return Math.max(1, Math.round(durationSec / bar)) * bar
}

/** Ruler step in seconds so labels sit at least `minPx` apart. */
export function rulerStep(pxPerSec: number, minPx = 48): number {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]) {
    if (s * pxPerSec >= minPx) return s
  }
  return 120
}
