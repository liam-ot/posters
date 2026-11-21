import type { VectorPath } from '../types/poster'
import { remapSwatches } from '../svg/palette'
import type { PuppetLayer, VectorSource } from './types'

const recolored = new WeakMap<VectorPath[], { key: string; out: VectorPath[] }>()

/**
 * The instance's paths with its colour overrides applied. Cached per snapshot
 * paths + overrides, so the stable array keeps the downstream path caches warm.
 */
function instancePaths(layer: PuppetLayer): VectorPath[] {
  const src = layer.snapshot.source.paths
  const overrides = layer.colorOverrides ?? {}
  const key = JSON.stringify(overrides)
  const hit = recolored.get(src)
  if (hit && hit.key === key) return hit.out
  const out = remapSwatches(src, overrides)
  recolored.set(src, { key, out })
  return out
}

/** The vector artwork an instance draws: its character's source, recoloured. */
export function instanceSource(layer: PuppetLayer): VectorSource {
  return { ...layer.snapshot.source, paths: instancePaths(layer) }
}
