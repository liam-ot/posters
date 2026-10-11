import type { Layer, PosterDoc, TimelineConfig } from '../types/poster'
import { normalizeAsset } from '../puppet/normalize'

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
  return {
    ...doc,
    timeline: { ...DEFAULT_TIMELINE, ...doc.timeline },
    layers: (doc.layers ?? []).map(normalizeLayer),
  }
}

function normalizeLayer(layer: Layer): Layer {
  // Character instances carry a whole asset; give it the asset defaults too.
  return layer.type === 'puppet' ? { ...layer, snapshot: normalizeAsset(layer.snapshot) } : layer
}
