import type { PosterDoc } from '../types/poster'
import { renderSceneToCanvas } from './renderScene'
import { useTimeline } from '../store/timeline'

export interface ExportResult {
  path?: string
  error?: string
}

function sanitizeName(name: string) {
  return (
    name
      .replace(/[^a-z0-9_\- ]/gi, '')
      .trim()
      .replace(/\s+/g, '-') || 'poster'
  )
}

export type StillFrame = 'rest' | 'current'

/**
 * Render a still and write a png/jpg to the project root. `rest` (default) is the
 * complete, un-animated poster; `current` is the frame at the playhead (docs/adr/0006).
 */
export async function exportImageToRoot(
  doc: PosterDoc,
  {
    format,
    scale,
    frame = 'rest',
  }: { format: 'png' | 'jpg'; scale: number; frame?: StillFrame },
): Promise<ExportResult> {
  await document.fonts.ready
  const t = frame === 'current' ? useTimeline.getState().time : 0
  const canvas = await renderSceneToCanvas(doc, t, scale, { rest: frame === 'rest' })
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
  const dataURL = canvas.toDataURL(mime, format === 'jpg' ? 0.92 : undefined)
  const dataBase64 = dataURL.slice(dataURL.indexOf(',') + 1)

  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: sanitizeName(doc.name), format, dataBase64 }),
    })
    if (!res.ok) return { error: await res.text() }
    return res.json()
  } catch (e) {
    return { error: String(e) }
  }
}
