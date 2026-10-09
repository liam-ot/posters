import type { PosterDoc } from '../types/poster'
import { renderSceneToCanvas } from './renderScene'
import type { ExportResult } from './image'

function sanitizeName(name: string) {
  return (
    name
      .replace(/[^a-z0-9_\- ]/gi, '')
      .trim()
      .replace(/\s+/g, '-') || 'poster'
  )
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

/**
 * Deterministically render each frame over the timeline, stream them to the
 * server, and have ffmpeg assemble an .mp4 in the project root.
 */
export async function exportVideoToRoot(
  doc: PosterDoc,
  {
    scale,
    onProgress,
  }: { scale: number; onProgress?: (fraction: number) => void },
): Promise<ExportResult> {
  await document.fonts.ready
  const { durationSec, fps } = doc.timeline
  const frameCount = Math.max(1, Math.round(durationSec * fps))

  try {
    const start = await post('/api/export/video/start', {
      fps,
      filename: sanitizeName(doc.name),
    })
    if (!start.ok) return { error: await start.text() }
    const { sessionId } = await start.json()

    for (let i = 0; i < frameCount; i++) {
      const t = i / fps
      const canvas = await renderSceneToCanvas(doc, t, scale)
      const dataURL = canvas.toDataURL('image/png')
      const dataBase64 = dataURL.slice(dataURL.indexOf(',') + 1)
      await post('/api/export/video/frame', { sessionId, index: i, dataBase64 })
      onProgress?.((i + 1) / frameCount)
      // Yield so the progress UI repaints and the tab stays responsive.
      await new Promise((r) => setTimeout(r, 0))
    }

    const finish = await post('/api/export/video/finish', { sessionId })
    if (!finish.ok) return { error: await finish.text() }
    return finish.json()
  } catch (e) {
    return { error: String(e) }
  }
}
