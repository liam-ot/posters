import type { PosterDoc } from '../types/poster'
import type { PuppetAsset } from '../puppet/types'
import { previewInstance } from '../puppet/convert'
import { DEFAULT_TIMELINE } from '../lib/normalize'
import { renderSceneToCanvas } from './renderScene'

const THUMB_WIDTH = 360

/**
 * Gallery thumbnail: the poster's rest state ("complete poster"), rendered
 * off-screen so it never depends on the playhead (docs/adr/0006).
 * Resolves to undefined if rendering fails, so a save can still go ahead.
 */
export async function renderThumbnail(doc: PosterDoc): Promise<string | undefined> {
  try {
    await document.fonts.ready
    const pixelRatio = Math.min(1, THUMB_WIDTH / doc.artboard.width)
    const canvas = await renderSceneToCanvas(doc, 0, pixelRatio, { rest: true })
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}

/**
 * Library thumbnail for a character: its artwork in the base pose on a
 * transparent background, drawn through the poster renderer so it matches
 * exactly what instances show.
 */
export async function renderAssetThumbnail(asset: PuppetAsset): Promise<string | undefined> {
  try {
    const { width, height } = asset.size
    const doc: PosterDoc = {
      id: 'thumb',
      name: asset.name,
      schemaVersion: 1,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      artboard: { width, height, background: 'rgba(0,0,0,0)' },
      timeline: DEFAULT_TIMELINE,
      layers: [previewInstance(asset)],
    }
    const pixelRatio = Math.min(2, THUMB_WIDTH / Math.max(width, height))
    const canvas = await renderSceneToCanvas(doc, 0, pixelRatio, { rest: true })
    return canvas.toDataURL('image/png')
  } catch {
    return undefined
  }
}
