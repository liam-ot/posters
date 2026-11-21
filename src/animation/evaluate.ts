import type { Layer, LayerAnimation } from '../types/poster'
import { ease } from './easing'
import { hashSeed } from './noise'
import { PRESETS } from './presets'
import {
  animationWindow,
  cycleOf,
  loopTime,
  periodSeconds,
  type EvalContext,
} from './timing'
import { identityFrame, identityPathFrame, type LayerFrame, type PathInfo } from './types'

export function hasActiveAnimations(layer: Layer): boolean {
  return !!layer.animations?.some((a) => a.enabled)
}

/**
 * Linear progress (0..1, before easing) of an in/out animation, where 1 = at
 * rest. Out is the time-mirror of in, so it counts down from 1.
 */
function progress(a: LayerAnimation, t: number, ctx: EvalContext): number {
  if (ctx.rest) return 1
  const { start, end } = animationWindow(a, ctx)
  const q = end > start ? Math.min(1, Math.max(0, (t - start) / (end - start))) : t >= end ? 1 : 0
  return a.phase === 'out' ? 1 - q : q
}

/**
 * The animated state of a layer at time t — a pure function of its inputs
 * (docs/adr/0004). In rest state every in/out is complete and loops are skipped.
 */
export function evaluateLayer(
  layer: Layer,
  t: number,
  ctx: EvalContext,
  infos: PathInfo[] = [],
): LayerFrame {
  const frame = identityFrame()
  for (const a of layer.animations ?? []) {
    if (!a.enabled) continue
    const def = PRESETS[a.preset]
    if (!def) continue
    const params = { ...def.defaults, ...a.params }
    const seed = hashSeed(layer.id + a.id)
    // Path presets need the layer's measured paths; without them there is nothing to animate.
    if (def.appliesTo === 'paths') {
      if (infos.length === 0) continue
      frame.paths ??= infos.map(identityPathFrame)
    }
    const easeFn = (x: number) => ease(a.easing, x)
    if (a.phase === 'loop') {
      if (ctx.rest) continue
      const period = periodSeconds(a, ctx)
      // A constant time shift, so loops that divide the timeline stay seamless.
      const tl = loopTime(a, t, period)
      def.apply(frame, { p: 1, cycle: cycleOf(tl, period), t: tl, period, params, layer, seed, u: 1, ease: easeFn, infos })
    } else {
      const u = progress(a, t, ctx)
      def.apply(frame, { p: ease(a.easing, u), cycle: 0, t, period: 1, params, layer, seed, u, ease: easeFn, infos })
    }
  }
  return frame
}
