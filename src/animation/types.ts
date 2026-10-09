import type { Layer } from '../types/poster'

/**
 * What animations produce, independent of any renderer (docs/adr/0001).
 * Translate/rotation add; scale/opacity multiply.
 */
export interface LayerFrame {
  dx: number // px
  dy: number // px
  rotation: number // degrees
  scaleX: number
  scaleY: number
  opacity: number
}

export const identityFrame = (): LayerFrame => ({
  dx: 0,
  dy: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
})

export type Params = Record<string, number | string | boolean>

export interface PresetInput {
  /** in/out: presence, 0 = fully hidden … 1 = at rest (may overshoot with back/elastic). Loops: 1. */
  p: number
  /** loop: position within the cycle, 0..1. */
  cycle: number
  /** timeline seconds. */
  t: number
  /** loop period in seconds. */
  period: number
  params: Params
  layer: Layer
  /** stable per animation, for seeded randomness. */
  seed: number
}
