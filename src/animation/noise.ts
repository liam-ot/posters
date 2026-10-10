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

// simplex-noise's 4D noise is slightly discontinuous (~0.1%) at exact lattice
// points, which a loop would hit at cycle 0 (w exactly 0) and for any point with a
// zero coordinate. An irrational start angle and offset keep samples off those ties.
const LOOP_PHASE = 0.6180339887
const OFFSET_X = 0.1234567
const OFFSET_Y = 0.7654321

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
  const a = cycle * Math.PI * 2 + LOOP_PHASE
  return noiseFor(seed)(channel * 31.7 + OFFSET_X, channel * 7.3 + OFFSET_Y, radius * Math.cos(a), radius * Math.sin(a))
}

/**
 * Like `loopNoise`, but also varies across space: the value at (x, y) changes
 * smoothly with position and returns to its start after one cycle. Used to bend
 * paths, where neighbouring points must move together.
 */
export function loopNoiseAt(
  seed: number,
  channel: number,
  x: number,
  y: number,
  cycle: number,
  radius: number,
): number {
  const a = cycle * Math.PI * 2 + LOOP_PHASE
  return noiseFor(seed)(x + channel * 31.7 + OFFSET_X, y + channel * 7.3 + OFFSET_Y, radius * Math.cos(a), radius * Math.sin(a))
}
