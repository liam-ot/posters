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
import { normalizeDoc } from '../lib/normalize'
import type { PuppetAsset } from '../puppet/types'
import { relink } from '../puppet/link'

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
  /** Remove one animation from a layer (the layer itself stays). */
  removeAnimation: (layerId: string, animId: string) => void
  /** Swap a layer for a different object in place (e.g. an SVG layer → a character instance). */
  replaceLayer: (id: string, layer: Layer) => void
  updateSelected: (patch: Partial<Layer>) => void
  removeLayer: (id: string) => void
  removeSelected: () => void
  /** Move several layers in one undo step (multi-select drag, nudge). */
  moveLayers: (positions: Record<string, { x: number; y: number }>) => void
  /**
   * Copy layers. Default: each copy offset by 24 px just above its layer, and the
   * copies selected (⌘D). `inPlace`: copies stay exactly where the layers are, just
   * below them, and selection is kept — Alt-drag then moves the originals away,
   * leaving the copies behind.
   */
  duplicateLayers: (ids: string[], opts?: { inPlace?: boolean }) => void
  /** ⌘C / ⌘X / ⌘V. The clipboard lives outside the doc, so it survives switching posters. */
  copySelected: () => void
  cutSelected: () => void
  paste: () => void
  /** Place a library character; existing linked copies move to the same snapshot so all copies share it. */
  placeCharacter: (asset: PuppetAsset) => void
  reorderLayer: (id: string, toIndex: number) => void
  moveLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void

  updateArtboard: (patch: Partial<ArtboardConfig>) => void
  updateTimeline: (patch: Partial<TimelineConfig>) => void
  renameDoc: (name: string) => void
}

/**
 * A fresh copy of a layer with a new id. A linked character copy shares its
 * snapshot instead of deep-copying it.
 */
function cloneLayer(src: Layer, offset = 0, name = src.name): Layer {
  const shared = src.type === 'puppet' && !src.detached ? src.snapshot : undefined
  const body = shared ? { ...src, snapshot: undefined } : src
  return {
    ...structuredClone(body),
    ...(shared ? { snapshot: shared } : {}),
    id: nanoid(),
    name,
    x: src.x + offset,
    y: src.y + offset,
  } as Layer
}

const PASTE_OFFSET = 24
// Copied layers (bottom to top) and how many times they've been pasted.
let clipboard: Layer[] = []
let pasteCount = 0

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

      // Each opened poster starts a fresh undo history: undoing past the open
      // would otherwise bring back the previous poster's doc (and autosave it).
      loadDoc: (doc) => {
        set({ doc: normalizeDoc(doc), selectedIds: [] })
        useEditor.temporal.getState().clear()
      },
      newDoc: (name) => {
        set({ doc: createDefaultDoc(name), selectedIds: [] })
        useEditor.temporal.getState().clear()
      },
      closeDoc: () => {
        set({ doc: null, selectedIds: [] })
        useEditor.temporal.getState().clear()
      },

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

      removeAnimation: (layerId, animId) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            const l = d.layers.find((x) => x.id === layerId)
            if (l?.animations) l.animations = l.animations.filter((a) => a.id !== animId)
          }),
        })),

      replaceLayer: (id, layer) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            const idx = d.layers.findIndex((l) => l.id === id)
            if (idx >= 0) d.layers[idx] = layer
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

      moveLayers: (positions) =>
        set((s) => ({
          doc: mutate(s.doc, (d) => {
            for (const l of d.layers) {
              const p = positions[l.id]
              if (p) Object.assign(l, p)
            }
          }),
        })),

      duplicateLayers: (ids, opts) => {
        const s = get()
        if (!s.doc || ids.length === 0) return
        const inPlace = !!opts?.inPlace
        const copies: string[] = []
        set({
          doc: mutate(s.doc, (d) => {
            // Clone from the committed doc (not the draft), bottom to top.
            for (const src of s.doc!.layers) {
              if (!ids.includes(src.id)) continue
              const copy = cloneLayer(src, inPlace ? 0 : PASTE_OFFSET, `${src.name} copy`)
              const idx = d.layers.findIndex((l) => l.id === src.id)
              d.layers.splice(inPlace ? idx : idx + 1, 0, copy)
              copies.push(copy.id)
            }
          }),
          selectedIds: inPlace ? s.selectedIds : copies,
        })
      },

      copySelected: () => {
        const { doc, selectedIds } = get()
        if (!doc || selectedIds.length === 0) return
        clipboard = doc.layers.filter((l) => selectedIds.includes(l.id)).map((l) => structuredClone(l))
        pasteCount = 0
      },

      cutSelected: () => {
        get().copySelected()
        get().removeSelected()
      },

      // Pastes on top, each paste stepping a further 24 px so copies don't stack invisibly.
      paste: () => {
        const doc = get().doc
        if (!doc || clipboard.length === 0) return
        pasteCount++
        const copies = clipboard.map((l) => cloneLayer(l, PASTE_OFFSET * pasteCount))
        set({
          doc: mutate(doc, (d) => {
            d.layers.push(...copies)
          }),
          selectedIds: copies.map((l) => l.id),
        })
      },

      placeCharacter: (asset) => {
        const doc = get().doc
        if (!doc) return
        const layer = createLayer('puppet', doc.artboard, { asset })
        set({
          doc: mutate(doc, (d) => {
            d.layers.forEach((l, i) => {
              if (l.type === 'puppet' && !l.detached && l.assetId === asset.id) d.layers[i] = relink(l, asset)
            })
            d.layers.push(layer)
          }),
          selectedIds: [layer.id],
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
      // Selection-only updates leave `doc` untouched; don't record them as
      // empty undo steps (immer keeps the reference when nothing changed).
      equality: (past, current) => past.doc === current.doc,
    },
  ),
)

// Convenience selectors
export const useDoc = () => useEditor((s) => s.doc)
export const useSelectedLayers = (): Layer[] =>
  useEditor((s) =>
    s.doc ? s.doc.layers.filter((l) => s.selectedIds.includes(l.id)) : [],
  )
