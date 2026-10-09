import type Konva from 'konva'
import type { PosterDoc } from '../types/poster'

// Singleton handle to the live Konva stage, used by export + thumbnails.
let _stage: Konva.Stage | null = null

export function setStage(s: Konva.Stage | null) {
  _stage = s
}
export function getStage(): Konva.Stage | null {
  return _stage
}

interface CaptureOpts {
  pixelRatio?: number
  mimeType?: 'image/png' | 'image/jpeg'
  quality?: number
}

/**
 * Render just the artboard (no transformer, no view transform) to a data URL
 * at full resolution. Does NOT redraw the visible canvas, so there's no flash.
 */
export function captureStageDataURL(
  doc: PosterDoc,
  { pixelRatio = 1, mimeType = 'image/png', quality }: CaptureOpts = {},
): string {
  const stage = _stage
  if (!stage) return ''

  const tr = stage.findOne('Transformer')
  const prev = {
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
    x: stage.x(),
    y: stage.y(),
  }
  const trVisible = tr?.visible() ?? false

  stage.scale({ x: 1, y: 1 })
  stage.position({ x: 0, y: 0 })
  tr?.visible(false)

  const url = stage.toDataURL({
    x: 0,
    y: 0,
    width: doc.artboard.width,
    height: doc.artboard.height,
    pixelRatio,
    mimeType,
    quality,
  })

  stage.scale({ x: prev.scaleX, y: prev.scaleY })
  stage.position({ x: prev.x, y: prev.y })
  tr?.visible(trVisible)

  return url
}
