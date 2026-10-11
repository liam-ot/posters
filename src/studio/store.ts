import { create } from 'zustand'
import { temporal } from 'zundo'
import { produce } from 'immer'
import type { PuppetAsset } from '../puppet/types'
import { normalizeAsset } from '../puppet/normalize'

/**
 * The character open in the puppet studio. Its own store and undo history, so
 * studio edits and poster edits never interleave (docs/adr/0013).
 */
interface StudioState {
  asset: PuppetAsset | null
  /** Selected motion; undefined = the base pose. */
  motionId?: string
  load: (asset: PuppetAsset) => void
  close: () => void
  /** Mutate the asset immutably; stamps updatedAt and a new version. */
  edit: (fn: (draft: PuppetAsset) => void) => void
  setMotion: (id: string | undefined) => void
  /** View option, not part of the character. */
  showMesh: boolean
  setShowMesh: (v: boolean) => void
  /** Last mesh build time, ms (for the stats line). */
  meshMs?: number
  /** Replace the asset without an undo step (e.g. building a missing mesh on open). */
  silently: (fn: (draft: PuppetAsset) => void) => void
}

export const useStudio = create<StudioState>()(
  temporal(
    (set) => ({
      asset: null,
      motionId: undefined,
      load: (asset) => set({ asset: normalizeAsset(asset), motionId: undefined }),
      close: () => set({ asset: null, motionId: undefined }),
      edit: (fn) =>
        set((s) => {
          if (!s.asset) return s
          return {
            asset: produce(s.asset, (draft) => {
              fn(draft)
              draft.updatedAt = new Date().toISOString()
              // Any change, so linked posters refresh — even to an undone state.
              draft.version = Math.max(Date.now(), s.asset!.version + 1)
            }),
          }
        }),
      setMotion: (motionId) => set({ motionId }),
      showMesh: true,
      setShowMesh: (showMesh) => set({ showMesh }),
      silently: (fn) => {
        const t = useStudio.temporal.getState()
        t.pause()
        useStudio.getState().edit(fn)
        t.resume()
      },
    }),
    {
      limit: 100,
      partialize: (s) => ({ asset: s.asset }),
      equality: (past, current) => past.asset === current.asset,
    },
  ),
)
