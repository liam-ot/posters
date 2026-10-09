import { createNoise4D } from 'simplex-noise'
import { mulberry32 } from '../generators/util'

export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const cache = new Map<number, ReturnType<typeof createNoise4D>>()
function noiseFor(seed: number) {
  let n = cache.get(seed)
  if (!n) {
    n = createNoise4D(mulberry32(seed))
    cache.set(seed, n)
  }
  return n
}

/**
 * Noise that returns to its starting value after one cycle: the time axis is a
 * circle in the noise's 3rd/4th dimensions (docs/adr/0004). `channel` picks an
 * independent stream; `radius` sets how fast it moves (≈ features per cycle).
 * Output is roughly -1..1.
 */
export function loopNoise(
  seed: number,
  channel: number,
  cycle: number,
  radius: number,
): number {
  const a = cycle * Math.PI * 2
  return noiseFor(seed)(channel * 31.7, channel * 7.3, radius * Math.cos(a), radius * Math.sin(a))
}
