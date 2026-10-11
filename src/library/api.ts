import type { AssetSummary, PuppetAsset } from '../puppet/types'
import { normalizeAsset } from '../puppet/normalize'

export async function listAssets(): Promise<AssetSummary[]> {
  const res = await fetch('/api/assets')
  if (!res.ok) return []
  return res.json()
}

export async function getAsset(id: string): Promise<PuppetAsset | null> {
  const res = await fetch(`/api/assets/${id}`)
  if (!res.ok) return null
  return normalizeAsset(await res.json())
}

export async function saveAsset(asset: PuppetAsset, thumbnail?: string): Promise<void> {
  await fetch(`/api/assets/${asset.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc: asset, thumbnail }),
  })
}

export async function deleteAsset(id: string): Promise<void> {
  await fetch(`/api/assets/${id}`, { method: 'DELETE' })
}

/** Posters that place this character. */
export async function assetUsage(id: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`/api/assets/${id}/usage`)
  if (!res.ok) return []
  return res.json()
}

export function assetThumbUrl(id: string, updatedAt: string): string {
  return `/api/assets/${id}/thumb?v=${encodeURIComponent(updatedAt)}`
}
