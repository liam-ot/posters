import type { PoseLoop, PuppetAsset } from './types'

export const DEFAULT_MESH_DETAIL = 300

/** Motions rock between the base pose and their own pose by default: two beats per cycle. */
export const DEFAULT_POSE_LOOP: PoseLoop = { enabled: true, shape: 'smooth', period: 2, periodUnit: 'beat' }

/**
 * Fill defaults on a loaded character, like `normalizeDoc` does for posters
 * (docs/adr/0009). Pure and idempotent; unknown fields are preserved.
 */
export function normalizeAsset(asset: PuppetAsset): PuppetAsset {
  const now = new Date(0).toISOString()
  return {
    ...asset,
    kind: 'puppet',
    schemaVersion: 1,
    name: asset.name ?? 'Character',
    version: asset.version ?? 1,
    createdAt: asset.createdAt ?? asset.updatedAt ?? now,
    updatedAt: asset.updatedAt ?? asset.createdAt ?? now,
    source: {
      ...asset.source,
      paths: asset.source?.paths ?? [],
    },
    puppet: {
      ...asset.puppet,
      detail: asset.puppet?.detail ?? DEFAULT_MESH_DETAIL,
      pins: asset.puppet?.pins ?? [],
    },
    motions: (asset.motions ?? []).map((m) => ({
      ...m,
      poseLoop: m.poseLoop ?? DEFAULT_POSE_LOOP,
      animations: m.animations ?? {},
    })),
  }
}
