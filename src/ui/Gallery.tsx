import { useCallback, useEffect, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { PosterSummary } from '../types/poster'
import {
  deletePoster,
  getPoster,
  listPosters,
  savePoster,
  thumbUrl,
} from '../api/posters'
import { createDefaultDoc } from '../lib/layers'
import { useEditor } from '../store/editor'
import { useUI } from '../store/ui'

export function Gallery() {
  const [posters, setPosters] = useState<PosterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const loadDoc = useEditor((s) => s.loadDoc)
  const setView = useUI((s) => s.setView)

  const refresh = useCallback(async () => {
    setLoading(true)
    setPosters(await listPosters())
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const openPoster = async (id: string) => {
    const doc = await getPoster(id)
    if (doc) {
      loadDoc(doc)
      setView('editor')
    }
  }

  const createNew = async () => {
    const doc = createDefaultDoc(`Poster ${posters.length + 1}`)
    await savePoster(doc)
    loadDoc(doc)
    setView('editor')
  }

  const duplicate = async (id: string) => {
    const doc = await getPoster(id)
    if (!doc) return
    const now = new Date().toISOString()
    const copy = {
      ...structuredClone(doc),
      id: nanoid(),
      name: `${doc.name} copy`,
      createdAt: now,
      updatedAt: now,
    }
    await savePoster(copy)
    refresh()
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete “${name}”? This can’t be undone.`)) return
    await deletePoster(id)
    refresh()
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] px-6">
        <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] bg-clip-text text-lg font-bold text-transparent">
          Poster Studio
        </span>
        <button
          onClick={createNew}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} /> New poster
        </button>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {loading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : posters.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="text-[var(--color-muted)]">
              No posters yet. Create your first one.
            </p>
            <button
              onClick={createNew}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus size={16} /> New poster
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {posters.map((p) => (
              <div key={p.id} className="group flex flex-col gap-2">
                <button
                  onClick={() => openPoster(p.id)}
                  className="relative aspect-[3/4] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] transition-colors hover:border-[var(--color-accent)]"
                >
                  <img
                    src={thumbUrl(p.id, p.updatedAt)}
                    alt={p.name}
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                    }}
                  />
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <span
                      role="button"
                      title="Duplicate"
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicate(p.id)
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"
                    >
                      <Copy size={14} />
                    </span>
                    <span
                      role="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(p.id, p.name)
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white hover:bg-red-500/80"
                    >
                      <Trash2 size={14} />
                    </span>
                  </div>
                </button>
                <div className="px-0.5">
                  <p className="truncate text-sm text-[var(--color-text)]">
                    {p.name}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {p.width}×{p.height}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
