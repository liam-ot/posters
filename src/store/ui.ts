import { create } from 'zustand'

export type AppView = 'gallery' | 'editor'

interface UIState {
  view: AppView
  setView: (view: AppView) => void
  // bumped to request a "zoom to fit" from the canvas
  fitNonce: number
  requestFit: () => void
}

export const useUI = create<UIState>((set) => ({
  view: 'gallery',
  setView: (view) => set({ view }),
  fitNonce: 0,
  requestFit: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),
}))
