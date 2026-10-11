import type { Layer, PosterDoc, TimelineConfig } from '../types/poster'
import { normalizeAsset } from '../puppet/normalize'
import { hydrateCharacters } from '../puppet/share'
import type { PuppetAsset } from '../puppet/types'

export const DEFAULT_TIMELINE: TimelineConfig = {
  durationSec: 5,
  fps: 30,
  loop: true,
}

/**
 * Fill defaults for fields added after a poster was saved. Called wherever a
 * doc is loaded so the rest of the app can rely on them (docs/adr/0009).
 * Pure and idempotent; unknown fields are preserved.
 */
export function normalizeDoc(doc: PosterDoc): PosterDoc {
  // Attach shared character snapshots first (docs/plans/puppet-pins.md §10), then
  // give each distinct snapshot the asset defaults once, so copies keep sharing it.
  const hydrated = hydrateCharacters({ ...doc, layers: doc.layers ?? [] })
  const normalized = new Map<PuppetAsset, PuppetAsset>()
  const once = (a: PuppetAsset) => {
    let n = normalized.get(a)
    if (!n) normalized.set(a, (n = normalizeAsset(a)))
    return n
  }
  return {
    ...hydrated,
    timeline: { ...DEFAULT_TIMELINE, ...doc.timeline },
    layers: hydrated.layers.map((l: Layer) => (l.type === 'puppet' ? { ...l, snapshot: once(l.snapshot) } : l)),
  }
}
