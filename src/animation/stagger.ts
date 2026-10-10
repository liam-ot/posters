import { mulberry32 } from '../generators/util'
import type { PathInfo } from './types'

export type PathOrder = 'document' | 'reverse' | 'random' | 'ltr' | 'ttb'

/** Rank (0 = first) of every path under an ordering. Stable; ties keep document order. */
export function orderRanks(order: PathOrder, infos: PathInfo[], seed: number): number[] {
  const n = infos.length
  const idx = Array.from({ length: n }, (_, i) => i)
  let sorted: number[]
  switch (order) {
    case 'reverse':
      sorted = idx.slice().reverse()
      break
    case 'random': {
      const rand = mulberry32(seed)
      sorted = idx.slice()
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
      }
      break
    }
    case 'ltr':
      sorted = idx.slice().sort((a, b) => infos[a].cx - infos[b].cx || a - b)
      break
    case 'ttb':
      sorted = idx.slice().sort((a, b) => infos[a].cy - infos[b].cy || a - b)
      break
    default:
      sorted = idx
  }
  const ranks = new Array<number>(n)
  sorted.forEach((pathIndex, rank) => (ranks[pathIndex] = rank))
  return ranks
}

/**
 * Each of `n` items animates over a window of the whole; `stagger` 0 = all
 * together, 1 = strictly one after another. The first starts at 0 and the last
 * ends at 1, so the sequence always fits the animation's duration.
 * Returns the item's own linear progress (0..1) at overall progress `u`.
 */
export function staggerProgress(u: number, rank: number, n: number, stagger: number): number {
  if (n <= 1) return clamp01(u)
  const s = clamp01(stagger)
  const window = 1 / (1 + (n - 1) * s)
  const start = rank * s * window
  return clamp01((u - start) / window)
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
