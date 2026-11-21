import { useEffect } from 'react'
import { useEditor } from '../store/editor'
import { useUI } from '../store/ui'
import { savePoster } from '../api/posters'
import { renderThumbnail } from '../export/thumbnail'

/** Debounced autosave of the current doc (with a thumbnail) while editing. */
export function useAutosave() {
  const doc = useEditor((s) => s.doc)
  const view = useUI((s) => s.view)

  useEffect(() => {
    if (view !== 'editor' || !doc) return
    let cancelled = false
    const handle = setTimeout(async () => {
      const thumbnail = await renderThumbnail(doc)
      // A newer edit (or leaving the editor) schedules its own save.
      if (!cancelled) savePoster(doc, thumbnail)
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [doc, view])
}
