import { create } from 'zustand'
import { temporal } from 'zundo'
import { produce } from 'immer'
import { nanoid } from 'nanoid'
import type {
  ArtboardConfig,
  Layer,
  LayerType,
  PosterDoc,
  TimelineConfig,
} from '../types/poster'
import { createDefaultDoc, createLayer } from '../lib/layers'

interface EditorState {
  doc: PosterDoc | null
  selectedIds: string[]

  loadDoc: (doc: PosterDoc) => void
  newDoc: (name?: string) => void
  closeDoc: () => void

  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void

  addLayer: (
    type: LayerType,
    opts?: Parameters<typeof createLayer>[2],
  ) => string | undefined
  addLayerObject: (layer: Layer) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  updateSelected: (patch: Partial<Layer>) => void
  removeLayer: (id: string) => void
  removeSelected: () => void
  duplicateLayer: (id: string) => void
  reorderLayer: (id: string, toIndex: number) => void
  moveLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void

  updateArtboard: (patch: Partial<ArtboardConfig>) => void
  updateTimeline: (patch: Partial<TimelineConfig>) => void
  renameDoc: (name: string) => void
}

/** Mutate the current doc immutably and stamp updatedAt. */
function mutate(
  doc: PosterDoc | null,
  fn: (draft: PosterDoc) => void,
): PosterDoc | null {
  if (!doc) return doc
  return produce(doc, (draft) => {
    fn(draft)
    draft.updatedAt = new Date().toISOString()
  })
}

export const useEditor = create<EditorState>()(
  temporal(
    (set, get) => ({
      doc: null,
      selectedIds: [],

      loadDoc: (doc) => set({ doc, selectedIds: [] }),
      newDoc: (name) => set({ doc: createDefaultDoc(name), selectedIds: [] }),
      closeDoc: () => set({ doc: null, selectedIds: [] }),

      setSelection: (ids) => set({ selectedIds: ids }),
      toggleSelection: (id) =>
        set((s) => ({
          selectedIds: s.selectedIds.includes(id)
            ? s.selectedIds.filter((x) => x !== id)
            : [...s.selectedIds, id],
        })),

      addLayer: (type, opts) => {
        const doc = get().doc
        if (!doc) return undefined
        const layer = createLayer(type, doc.artboard, opts)
        set({
          doc: mutate(doc, (d) => {
            d.layers.push(layer)
          }),
          selectedIds: [layer.id],
        })
        return layer.id
      },

      addLayerObject: (layer) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            d.layers.push(layer)
          }),
          selectedIds: [layer.id],
        })),

      updateLayer: (id, patch) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            const idx = d.layers.findIndex((l) => l.id === id)
            if (idx >= 0) Object.assign(d.layers[idx], patch)
          }),
        })),

      updateSelected: (patch) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            for (const id of s.selectedIds) {
              const idx = d.layers.findIndex((l) => l.id === id)
              if (idx >= 0) Object.assign(d.layers[idx], patch)
            }
          }),
        })),

      removeLayer: (id) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            d.layers = d.layers.filter((l) => l.id !== id)
          }),
          selectedIds: s.selectedIds.filter((x) => x !== id),
        })),

      removeSelected: () =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            d.layers = d.layers.filter((l) => !s.selectedIds.includes(l.id))
          }),
          selectedIds: [],
        })),

      duplicateLayer: (id) => {
        const s = get()
        if (!s.doc) return
        const src = s.doc.layers.find((l) => l.id === id)
        if (!src) return
        const copy: Layer = {
          ...structuredClone(src),
          id: nanoid(),
          name: `${src.name} copy`,
          x: src.x + 24,
          y: src.y + 24,
        }
        set({
          doc: mutate(s.doc, (d) => {
            const idx = d.layers.findIndex((l) => l.id === id)
            d.layers.splice(idx + 1, 0, copy)
          }),
          selectedIds: [copy.id],
        })
      },

      reorderLayer: (id, toIndex) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            const from = d.layers.findIndex((l) => l.id === id)
            if (from < 0) return
            const [item] = d.layers.splice(from, 1)
            d.layers.splice(Math.max(0, Math.min(toIndex, d.layers.length)), 0, item)
          }),
        })),

      moveLayer: (id, dir) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            const from = d.layers.findIndex((l) => l.id === id)
            if (from < 0) return
            const last = d.layers.length - 1
            let to = from
            if (dir === 'up') to = Math.min(last, from + 1)
            else if (dir === 'down') to = Math.max(0, from - 1)
            else if (dir === 'top') to = last
            else if (dir === 'bottom') to = 0
            const [item] = d.layers.splice(from, 1)
            d.layers.splice(to, 0, item)
          }),
        })),

      updateArtboard: (patch) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            Object.assign(d.artboard, patch)
          }),
        })),

      updateTimeline: (patch) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            Object.assign(d.timeline, patch)
          }),
        })),

      renameDoc: (name) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            d.name = name
          }),
        })),
    }),
    {
      // Only the document is tracked for undo/redo — not transient selection.
      limit: 100,
      partialize: (state) => ({ doc: state.doc }),
    },
  ),
)

// Convenience selectors
export const useDoc = () => useEditor((s) => s.doc)
export const useSelectedLayers = (): Layer[] =>
  useEditor((s) =>
    s.doc ? s.doc.layers.filter((l) => s.selectedIds.includes(l.id)) : [],
  )
