import { create } from 'zustand'

export type AppView = 'gallery' | 'editor' | 'studio'
export type GalleryTab = 'posters' | 'characters'

interface UIState {
  view: AppView
  setView: (view: AppView) => void
  galleryTab: GalleryTab
  setGalleryTab: (tab: GalleryTab) => void
  // Where the puppet studio's back button returns to.
  studioReturn: 'gallery' | 'editor'
  openStudio: (from: 'gallery' | 'editor') => void
  // bumped to request a "zoom to fit" from the canvas
  fitNonce: number
  requestFit: () => void
  // Show every layer in its final, un-animated state (docs/adr/0006).
  showRest: boolean
  setShowRest: (v: boolean) => void
  // Timeline panel (Phase 5): docked under the canvas, collapsed by default.
  timelineOpen: boolean
  setTimelineOpen: (v: boolean) => void
  timelineHeight: number
  setTimelineHeight: (px: number) => void
  // Animation bar folded into a small button in the canvas corner (remembered per browser).
  barCollapsed: boolean
  setBarCollapsed: (v: boolean) => void
  // The animation whose bar is selected in the timeline panel: Delete removes it, not its layer.
  selectedAnim: { layerId: string; animId: string } | null
  setSelectedAnim: (v: { layerId: string; animId: string } | null) => void
}

const BAR_KEY = 'poster-studio:bar-collapsed'
function readBarCollapsed(): boolean {
  try {
    return localStorage.getItem(BAR_KEY) === '1'
  } catch {
    return false
  }
}

export const useUI = create<UIState>((set) => ({
  view: 'gallery',
  setView: (view) => set({ view }),
  galleryTab: 'posters',
  setGalleryTab: (galleryTab) => set({ galleryTab }),
  studioReturn: 'gallery',
  openStudio: (studioReturn) => set({ view: 'studio', studioReturn }),
  fitNonce: 0,
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
  showRest: false,
  setShowRest: (showRest) => set({ showRest }),
  timelineOpen: false,
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  timelineHeight: 220,
  setTimelineHeight: (timelineHeight) => set({ timelineHeight }),
  barCollapsed: readBarCollapsed(),
  setBarCollapsed: (barCollapsed) => {
    try {
      localStorage.setItem(BAR_KEY, barCollapsed ? '1' : '0')
    } catch {
      /* private mode etc. — just don't remember it */
    }
    set({ barCollapsed })
  },
  selectedAnim: null,
  setSelectedAnim: (selectedAnim) => set({ selectedAnim }),
}))
