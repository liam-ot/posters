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

/** Render the current frame and write a png/jpg to the project root. */
export async function exportImageToRoot(
  doc: PosterDoc,
  { format, scale }: { format: 'png' | 'jpg'; scale: number },
): Promise<ExportResult> {
  await document.fonts.ready
  const t = useTimeline.getState().time
  const canvas = await renderSceneToCanvas(doc, t, scale)
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
