import { useEffect } from 'react'
import { useEditor } from '../store/editor'
import { useUI } from '../store/ui'
import { savePoster } from '../api/posters'
import { captureStageDataURL } from '../canvas/stageHandle'

const THUMB_WIDTH = 360

/** Debounced autosave of the current doc (with a thumbnail) while editing. */
export function useAutosave() {
  const doc = useEditor((s) => s.doc)
  const view = useUI((s) => s.view)

  useEffect(() => {
    if (view !== 'editor' || !doc) return
    const handle = setTimeout(() => {
      const pixelRatio = Math.min(1, THUMB_WIDTH / doc.artboard.width)
      const thumbnail = captureStageDataURL(doc, {
        pixelRatio,
        mimeType: 'image/png',
      })
      savePoster(doc, thumbnail || undefined)
    }, 700)
    return () => clearTimeout(handle)
  }, [doc, view])
}
