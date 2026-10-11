import { cycleOf, loopTime, periodSeconds, type EvalContext } from '../animation/timing'
import type { LayerAnimation } from '../types/poster'
import { PIN_PRESETS } from './pinPresets'
import type { PoseLoop, PuppetAsset, PuppetMotion, PuppetPin, UV } from './types'

/**
 * Pin positions over time (docs/plans/puppet-pins.md §4.6). Pure in (asset,
 * motion, t, ctx), so canvas, export and studio agree and loops stay seamless.
 *
 * 1. Pose: the motion's pose, blended toward the base pose by the pose loop.
 * 2. Chains, parent first: a child keeps its offset from its parent, rotated by
 *    the parent's accumulated swing plus its own, so it follows translation and
 *    rotation (forward kinematics).
 * 3. Bob / circle / bounce add screen-aligned offsets.
 * Rest state (`ctx.rest`): loops off, the motion's pose kept.
 */

/** Timing fields shared with layer loops, so `periodSeconds`/`loopTime` apply. */
const asLoop = (l: { period: number; periodUnit: LayerAnimation['periodUnit']; phaseOffset?: number }) =>
  ({ period: l.period, periodUnit: l.periodUnit, phaseOffset: l.phaseOffset }) as LayerAnimation

/** 0..1 weight of the motion's pose (1 = fully in the motion's pose) at a point in the cycle. */
export function poseWeight(shape: PoseLoop['shape'], c: number): number {
  switch (shape) {
    case 'smooth':
      return (1 + Math.cos(Math.PI * 2 * c)) / 2
    case 'pop': {
      // Hold each pose, with a quick ease between them.
      const ease = (x: number) => x * x * (3 - 2 * x)
      const edge = 0.12
      if (c < 0.5 - edge) return 1
      if (c < 0.5) return 1 - ease((c - (0.5 - edge)) / edge)
      if (c < 1 - edge) return 0
      return ease((c - (1 - edge)) / edge)
    }
    case 'hit':
      return Math.pow(1 - c, 2)
  }
}

/** Does this motion move over time (pose loop or pin loops)? */
export function motionAnimates(asset: PuppetAsset, motionId?: string): boolean {
  const m = motionId ? asset.motions.find((x) => x.id === motionId) : undefined
  if (!m) return false
  const posed = !!m.poses && Object.keys(m.poses).length > 0
  return (posed && !!m.poseLoop?.enabled) || Object.values(m.animations).some((list) => list.some((a) => a.enabled))
}

function posedPositions(asset: PuppetAsset, motion: PuppetMotion | undefined, t: number, ctx: EvalContext) {
  const base = (p: PuppetPin): UV => p.pose ?? p.at
  let w = 1
  const loop = motion?.poseLoop
  if (motion && loop?.enabled && !ctx.rest) {
    const timing = asLoop(loop)
    const period = periodSeconds(timing, ctx)
    w = poseWeight(loop.shape, cycleOf(loopTime(timing, t, period), period))
  }
  return new Map<string, UV>(
    asset.puppet.pins.map((p) => {
      const b = base(p)
      const m = motion?.poses?.[p.id]
      return [p.id, m ? [b[0] + (m[0] - b[0]) * w, b[1] + (m[1] - b[1]) * w] : b]
    }),
  )
}

/** Parents first; a parent link that would close a cycle is ignored. */
function chainOrder(pins: PuppetPin[]): { order: PuppetPin[]; parentOf: Map<string, string> } {
  const byId = new Map(pins.map((p) => [p.id, p]))
  const parentOf = new Map<string, string>()
  for (const p of pins) {
    if (!p.parent || !byId.has(p.parent) || p.kind !== 'pin') continue
    // Walk up from the would-be parent; reaching p means a cycle.
    let cur: string | undefined = p.parent
    let cyclic = false
    for (let guard = 0; cur && guard <= pins.length; guard++) {
      if (cur === p.id) {
        cyclic = true
        break
      }
      cur = parentOf.get(cur) ?? byId.get(cur)?.parent
    }
    if (!cyclic) parentOf.set(p.id, p.parent)
  }
  const order: PuppetPin[] = []
  const done = new Set<string>()
  const visit = (p: PuppetPin) => {
    if (done.has(p.id)) return
    const parent = parentOf.get(p.id)
    if (parent) visit(byId.get(parent)!)
    done.add(p.id)
    order.push(p)
  }
  pins.forEach(visit)
  return { order, parentOf }
}

export function evaluatePins(asset: PuppetAsset, motionId: string | undefined, t: number, ctx: EvalContext): Map<string, UV> {
  const motion = motionId ? asset.motions.find((m) => m.id === motionId) : undefined
  const posed = posedPositions(asset, motion, t, ctx)
  if (!motion || ctx.rest) return posed

  const { order, parentOf } = chainOrder(asset.puppet.pins)
  const out = new Map<string, UV>()
  const angleOf = new Map<string, number>()
  for (const pin of order) {
    let angle = 0
    let dx = 0
    let dy = 0
    for (const a of motion.animations[pin.id] ?? []) {
      const def = PIN_PRESETS[a.preset]
      if (!a.enabled || !def) continue
      if (def.needsParent && !parentOf.has(pin.id)) continue
      const timing = asLoop(a)
      const period = periodSeconds(timing, ctx)
      const m = def.move(cycleOf(loopTime(timing, t, period), period), { ...def.defaults, ...a.params })
      angle += m.angle
      dx += m.dx
      dy += m.dy
    }
    const own = posed.get(pin.id)!
    const parent = parentOf.get(pin.id)
    let pos: UV = own
    if (parent) {
      const total = (angleOf.get(parent) ?? 0) + angle
      const pp = posed.get(parent)!
      const pnow = out.get(parent)!
      const r = (total * Math.PI) / 180
      const ox = own[0] - pp[0]
      const oy = own[1] - pp[1]
      pos = [pnow[0] + ox * Math.cos(r) - oy * Math.sin(r), pnow[1] + ox * Math.sin(r) + oy * Math.cos(r)]
      angle = total
    }
    angleOf.set(pin.id, angle)
    out.set(pin.id, [pos[0] + dx, pos[1] + dy])
  }
  return out
}

/**
 * Animated pin positions for a character instance at time t, or undefined when
 * its motion is still (or in rest state) — then the stored, cached pose is used.
 */
export function instancePins(
  layer: { snapshot: PuppetAsset; motionId?: string },
  t: number,
  ctx: EvalContext,
): Map<string, UV> | undefined {
  if (ctx.rest || !motionAnimates(layer.snapshot, layer.motionId)) return undefined
  return evaluatePins(layer.snapshot, layer.motionId, t, ctx)
}
