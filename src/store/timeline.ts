import { create } from 'zustand'
import { useUI } from './ui'

interface TimelineState {
  time: number // seconds
  playing: boolean
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  toggle: () => void
}

export const useTimeline = create<TimelineState>((set, get) => ({
  time: 0,
  playing: false,
  setTime: (time) => set({ time }),
  setPlaying: (playing) => {
    // Playing shows real motion, so leave the "rest state" preview.
    if (playing) useUI.getState().setShowRest(false)
    set({ playing })
  },
  toggle: () => get().setPlaying(!get().playing),
}))
