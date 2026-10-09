import type { PosterDoc, PosterSummary } from '../types/poster'

export async function listPosters(): Promise<PosterSummary[]> {
  const res = await fetch('/api/posters')
  if (!res.ok) return []
  return res.json()
}

export async function getPoster(id: string): Promise<PosterDoc | null> {
  const res = await fetch(`/api/posters/${id}`)
  if (!res.ok) return null
  return res.json()
}

export async function savePoster(
  doc: PosterDoc,
  thumbnail?: string,
): Promise<void> {
  await fetch(`/api/posters/${doc.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc, thumbnail }),
  })
}

export async function deletePoster(id: string): Promise<void> {
  await fetch(`/api/posters/${id}`, { method: 'DELETE' })
}

export function thumbUrl(id: string, updatedAt: string): string {
  // cache-bust by updatedAt so the gallery refreshes after a save
  return `/api/posters/${id}/thumb?v=${encodeURIComponent(updatedAt)}`
}
