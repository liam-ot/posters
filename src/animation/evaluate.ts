import type { Layer, LayerAnimation } from '../types/poster'
import { ease } from './easing'
import { hashSeed } from './noise'
import { PRESETS } from './presets'
import {
  animationWindow,
  cycleOf,
  periodSeconds,
  type EvalContext,
} from './timing'
import { identityFrame, type LayerFrame } from './types'

export function hasActiveAnimations(layer: Layer): boolean {
  return !!layer.animations?.some((a) => a.enabled)
}

/**
 * Presence of an in/out animation: 0 = hidden … 1 = at rest. Out plays the in
 * curve backwards (`ease(1 - q)`), so a preset only defines one curve.
 */
function presence(a: LayerAnimation, t: number, ctx: EvalContext): number {
  if (ctx.rest) return 1
  const { start, end } = animationWindow(a, ctx)
  const q = end > start ? Math.min(1, Math.max(0, (t - start) / (end - start))) : t >= end ? 1 : 0
  return a.phase === 'out' ? ease(a.easing, 1 - q) : ease(a.easing, q)
}

/**
 * The animated state of a layer at time t — a pure function of its inputs
 * (docs/adr/0004). In rest state every in/out is complete and loops are skipped.
 */
export function evaluateLayer(layer: Layer, t: number, ctx: EvalContext): LayerFrame {
  const frame = identityFrame()
  for (const a of layer.animations ?? []) {
    if (!a.enabled) continue
    const def = PRESETS[a.preset]
    if (!def) continue
    const params = { ...def.defaults, ...a.params }
    const seed = hashSeed(layer.id + a.id)
    if (a.phase === 'loop') {
      if (ctx.rest) continue
      const period = periodSeconds(a, ctx)
      def.apply(frame, { p: 1, cycle: cycleOf(t, period), t, period, params, layer, seed })
    } else {
      def.apply(frame, { p: presence(a, t, ctx), cycle: 0, t, period: 1, params, layer, seed })
    }
  }
  return frame
}
