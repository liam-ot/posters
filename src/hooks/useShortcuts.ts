import { useEffect } from 'react'
import { useEditor } from '../store/editor'
import { isTyping } from '../lib/keyboard'

/** Global editor keyboard shortcuts (undo/redo, duplicate, copy/paste, nudge, tools). */
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
        store.duplicateLayers(store.selectedIds)
        return
      }
      if (meta && e.key.toLowerCase() === 'c' && store.selectedIds.length > 0) {
        // Leave ⌘C alone when the user has highlighted page text to copy.
        if (window.getSelection()?.toString()) return
        e.preventDefault()
        store.copySelected()
        return
      }
      if (meta && e.key.toLowerCase() === 'x' && store.selectedIds.length > 0) {
        e.preventDefault()
        store.cutSelected()
        return
      }
      if (meta && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        store.paste()
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
        const positions: Record<string, { x: number; y: number }> = {}
        for (const l of store.doc.layers) {
          if (store.selectedIds.includes(l.id)) positions[l.id] = { x: l.x + dx, y: l.y + dy }
        }
        store.moveLayers(positions)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
