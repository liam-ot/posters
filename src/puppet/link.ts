import type { Layer, PosterDoc } from '../types/poster'
import type { PuppetAsset, PuppetLayer } from './types'

const isLinked = (l: Layer): l is PuppetLayer => l.type === 'puppet' && !l.detached

/** Ids of the characters a poster follows (detached instances don't). */
export function linkedAssetIds(doc: PosterDoc): string[] {
  return [...new Set(doc.layers.filter(isLinked).map((l) => l.assetId))]
}

/** Point an instance at a (new) version of its character. */
export function relink(layer: PuppetLayer, asset: PuppetAsset): PuppetLayer {
  const motionId = asset.motions.some((m) => m.id === layer.motionId) ? layer.motionId : undefined
  return { ...layer, snapshot: asset, assetVersion: asset.version, motionId, detached: undefined }
}

/**
 * Bring linked instances up to date with the library (docs/adr/0013).
 * `assets` maps every id from `linkedAssetIds` to its current asset, or null if
 * it no longer exists. Changed versions replace the snapshot (a motion that was
 * deleted falls back to "still"); missing assets leave the snapshot and detach.
 * Returns the same doc object when nothing changed.
 */
export function refreshSnapshots(
  doc: PosterDoc,
  assets: Map<string, PuppetAsset | null>,
): PosterDoc {
  let changed = false
  const layers = doc.layers.map((l) => {
    if (!isLinked(l) || !assets.has(l.assetId)) return l
    const asset = assets.get(l.assetId)
    if (asset === null) {
      changed = true
      return { ...l, detached: true }
    }
    if (!asset || asset.version === l.assetVersion) return l
    changed = true
    return relink(l, asset)
  })
  return changed ? { ...doc, layers } : doc
}
