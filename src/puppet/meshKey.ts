import { hashSeed } from '../animation/noise'
import type { PuppetAsset } from './types'

/**
 * The inputs a mesh depends on, hashed. A stored mesh whose key differs from
 * the current one is stale (the artwork or detail changed) and isn't used.
 */
export function meshKey(asset: PuppetAsset): string {
  const { source, size, puppet } = asset
  const parts = source.paths.map((p) => `${p.visible ? 1 : 0}${p.d}|${p.transform.join(',')}|${p.stroke ? p.strokeWidth : 0}`)
  const vb = source.viewBox
  const text = `${parts.join(';')}#${vb.x},${vb.y},${vb.width},${vb.height}#${size.width}x${size.height}#${puppet.detail}`
  return `${hashSeed(text).toString(36)}-${text.length.toString(36)}`
}

export const isMeshCurrent = (asset: PuppetAsset): boolean =>
  !!asset.puppet.mesh && asset.puppet.mesh.key === meshKey(asset)
