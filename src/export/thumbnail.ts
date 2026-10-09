import type { PosterDoc } from '../types/poster'
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
