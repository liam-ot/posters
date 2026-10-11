import { nanoid } from 'nanoid'
import type { PuppetAsset, PuppetPin, UV } from '../puppet/types'

const round = (v: number) => Math.round(v * 10) / 10
export const roundUV = ([x, y]: UV): UV => [round(x), round(y)]

/** A new pin (or starch pin) placed at `at`, named after its kind and count. */
export function newPin(asset: PuppetAsset, at: UV, kind: PuppetPin['kind']): PuppetPin {
  const n = asset.puppet.pins.filter((p) => p.kind === kind).length + 1
  const base = { id: nanoid(8), at: roundUV(at), kind, name: `${kind === 'pin' ? 'Pin' : 'Starch'} ${n}` }
  if (kind === 'pin') return base
  return { ...base, radius: round(Math.min(asset.size.width, asset.size.height) * 0.15), amount: 0.6 }
}

/**
 * Set a pin's pose in the given context: a motion's override, or the base pose.
 * Posing back onto the placement clears it, so "at rest" stays exactly at rest.
 */
export function setPose(draft: PuppetAsset, pinId: string, motionId: string | undefined, pos: UV | undefined) {
  const pin = draft.puppet.pins.find((p) => p.id === pinId)
  if (!pin) return
  const value = pos && roundUV(pos)
  if (motionId) {
    const m = draft.motions.find((x) => x.id === motionId)
    if (!m) return
    m.poses ??= {}
    if (value) m.poses[pinId] = value
    else delete m.poses[pinId]
    return
  }
  const atRest = !value || (value[0] === pin.at[0] && value[1] === pin.at[1])
  if (atRest) delete pin.pose
  else pin.pose = value
}

/** Remove a pin everywhere it's referenced. */
export function removePin(draft: PuppetAsset, pinId: string) {
  draft.puppet.pins = draft.puppet.pins.filter((p) => p.id !== pinId)
  for (const p of draft.puppet.pins) if (p.parent === pinId) delete p.parent
  for (const m of draft.motions) {
    if (m.poses) delete m.poses[pinId]
    delete m.animations[pinId]
  }
}

/** A copy of the asset with one pin temporarily posed — for live drag previews. */
export function withPose(asset: PuppetAsset, pinId: string, motionId: string | undefined, pos: UV): PuppetAsset {
  if (motionId) {
    return {
      ...asset,
      motions: asset.motions.map((m) => (m.id === motionId ? { ...m, poses: { ...m.poses, [pinId]: pos } } : m)),
    }
  }
  return {
    ...asset,
    puppet: { ...asset.puppet, pins: asset.puppet.pins.map((p) => (p.id === pinId ? { ...p, pose: pos } : p)) },
  }
}
