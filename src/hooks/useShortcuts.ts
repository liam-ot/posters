import { useEffect } from 'react'
import { useEditor } from '../store/editor'

function isTyping() {
  const el = document.activeElement
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el as HTMLElement | null)?.isContentEditable === true
  )
}

/** Global editor keyboard shortcuts (undo/redo, duplicate, nudge, tools). */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return
      const meta = e.metaKey || e.ctrlKey
      const store = useEditor.getState()
      const temporal = useEditor.temporal.getState()

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) temporal.redo()
        else temporal.undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        temporal.redo()
        return
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const id = store.selectedIds[0]
        if (id) store.duplicateLayer(id)
        return
      }
      if (e.key === 'Escape') {
        store.setSelection([])
        return
      }

      // Tool shortcuts (no modifier)
      if (!meta) {
        if (e.key === 'r') return void store.addLayer('rect')
        if (e.key === 'o') return void store.addLayer('ellipse')
        if (e.key === 't') return void store.addLayer('text')
      }

      // Arrow nudge
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
        store.selectedIds.length > 0 &&
        store.doc
      ) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        for (const id of store.selectedIds) {
          const l = store.doc.layers.find((x) => x.id === id)
          if (l) store.updateLayer(id, { x: l.x + dx, y: l.y + dy })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
