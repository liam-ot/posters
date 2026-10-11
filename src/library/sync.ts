import { useEditor } from '../store/editor'
import { linkedAssetIds, refreshSnapshots } from '../puppet/link'
import type { PuppetAsset } from '../puppet/types'
import { getAsset } from './api'

/**
 * Refresh the open poster's linked characters from the library (docs/adr/0013).
 * Not an undo step: the user didn't make this change, and undoing it would just
 * show stale artwork. The autosave picks the new doc up as usual.
 */
export async function syncLinkedAssets(): Promise<void> {
  const doc = useEditor.getState().doc
  if (!doc) return
  const ids = linkedAssetIds(doc)
  if (ids.length === 0) return
  const assets = new Map<string, PuppetAsset | null>()
  await Promise.all(ids.map(async (id) => assets.set(id, await getAsset(id))))

  // The doc may have changed while fetching; refresh whatever is current.
  const current = useEditor.getState().doc
  if (!current || current.id !== doc.id) return
  const next = refreshSnapshots(current, assets)
  if (next === current) return
  const temporal = useEditor.temporal.getState()
  temporal.pause()
  useEditor.setState({ doc: next })
  temporal.resume()
}
