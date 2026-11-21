import type { Layer, PosterDoc } from '../types/poster'
import type { PuppetAsset, PuppetLayer } from './types'

/**
 * Lightweight character copies (docs/plans/puppet-pins.md §10). A saved poster
 * holds one snapshot per linked character in `doc.characters`; in memory every
 * linked copy points at that same object, so copies share render caches.
 * Detached copies keep their own snapshot on the layer.
 */

const isLinked = (l: Layer): l is PuppetLayer => l.type === 'puppet' && !l.detached

/** Placeholder for a reference whose snapshot is missing: draws nothing until the library refresh fills it. */
function missingAsset(id: string): PuppetAsset {
  return {
    id,
    kind: 'puppet',
    schemaVersion: 1,
    name: 'Missing character',
    version: 0,
    createdAt: '',
    updatedAt: '',
    size: { width: 1, height: 1 },
    source: { viewBox: { x: 0, y: 0, width: 1, height: 1 }, paths: [] },
    puppet: { detail: 0, pins: [] },
    motions: [],
  }
}

/**
 * Loaded doc → in-memory doc: attach the shared snapshot to every linked copy.
 * Older posters stored a snapshot per layer; the first one per character becomes
 * the shared one. `doc.characters` itself isn't kept in memory.
 */
export function hydrateCharacters(doc: PosterDoc): PosterDoc {
  const shared = new Map<string, PuppetAsset>(Object.entries(doc.characters ?? {}))
  for (const l of doc.layers) {
    if (isLinked(l) && l.snapshot && !shared.has(l.assetId)) shared.set(l.assetId, l.snapshot)
  }
  const { characters: _stored, ...rest } = doc
  void _stored
  return {
    ...rest,
    layers: doc.layers.map((l) => {
      if (!isLinked(l)) return l
      const snapshot = shared.get(l.assetId) ?? missingAsset(l.assetId)
      return { ...l, snapshot, assetVersion: snapshot.version }
    }),
  }
}

/** In-memory doc → saved doc: linked copies drop their snapshot into `characters`. */
export function dehydrateCharacters(doc: PosterDoc): PosterDoc {
  // Start from any stored snapshots: a doc saved straight from disk (e.g. the
  // gallery's Duplicate) is already in this form and its layers carry none.
  const characters: Record<string, PuppetAsset> = { ...doc.characters }
  const fromLayers = new Set<string>()
  const layers = doc.layers.map((l) => {
    if (!isLinked(l)) return l
    // The in-memory snapshot (first copy) wins over a stored one.
    if (l.snapshot && !fromLayers.has(l.assetId)) {
      characters[l.assetId] = l.snapshot
      fromLayers.add(l.assetId)
    }
    const { snapshot: _snapshot, ...ref } = l
    void _snapshot
    return ref as unknown as Layer
  })
  return Object.keys(characters).length ? { ...doc, layers, characters } : { ...doc, layers }
}
