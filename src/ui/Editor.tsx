import { useEffect } from 'react'
import { ChevronLeft, Redo2, Undo2 } from 'lucide-react'
import { CanvasStage } from '../canvas/CanvasStage'
import { captureStageDataURL } from '../canvas/stageHandle'
import { savePoster } from '../api/posters'
import { useEditor } from '../store/editor'
import { useUI } from '../store/ui'
import { useAutosave } from '../hooks/useAutosave'
import { useShortcuts } from '../hooks/useShortcuts'
import { Toolbar } from './Toolbar'
import { Inspector } from './Inspector'
import { LayersPanel } from './LayersPanel'
import { TimelineBar } from './TimelineBar'
import { ExportDialog } from './ExportDialog'

export function Editor() {
  useAutosave()
  useShortcuts()
  const doc = useEditor((s) => s.doc)
  const renameDoc = useEditor((s) => s.renameDoc)
  const setView = useUI((s) => s.setView)
  const undo = () => useEditor.temporal.getState().undo()
  const redo = () => useEditor.temporal.getState().redo()

  // If we somehow land here without a doc, return to the gallery.
  useEffect(() => {
    if (!doc) setView('gallery')
  }, [doc, setView])

  if (!doc) return null

  const back = () => {
    const pixelRatio = Math.min(1, 360 / doc.artboard.width)
    const thumb = captureStageDataURL(doc, { pixelRatio })
    savePoster(doc, thumb || undefined)
    setView('gallery')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-3">
        <div className="flex items-center gap-2">
          <button
            onClick={back}
            title="Back to gallery"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
          >
            <ChevronLeft size={18} />
          </button>
          <input
            value={doc.name}
            onChange={(e) => renameDoc(e.target.value)}
            className="w-56 rounded-md bg-transparent px-1 text-sm text-[var(--color-text)] outline-none hover:bg-[var(--color-panel-2)] focus:bg-[var(--color-panel-2)]"
          />
          <div className="ml-1 flex items-center">
            <button
              onClick={undo}
              title="Undo (⌘Z)"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={redo}
              title="Redo (⌘⇧Z)"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
            >
              <Redo2 size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ExportDialog />
          <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] bg-clip-text text-sm font-bold text-transparent">
            Poster Studio
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-panel)]">
          <LayersPanel />
        </aside>

        <main className="relative min-w-0 flex-1">
          <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <Toolbar />
          </div>
          <CanvasStage />
          <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
            <TimelineBar />
          </div>
        </main>

        <aside className="w-72 shrink-0 border-l border-[var(--color-border)] bg-[var(--color-panel)]">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
