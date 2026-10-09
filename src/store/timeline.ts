import { create } from 'zustand'

interface TimelineState {
  time: number // seconds
  playing: boolean
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  toggle: () => void
}

export const useTimeline = create<TimelineState>((set) => ({
  time: 0,
  playing: false,
  setTime: (time) => set({ time }),
  setPlaying: (playing) => set({ playing }),
  toggle: () => set((s) => ({ playing: !s.playing })),
}))
