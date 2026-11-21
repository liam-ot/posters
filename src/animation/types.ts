import type { Layer } from '../types/poster'

/** Measured facts about one path, supplied by the renderer (needs a DOM/Konva). */
export interface PathInfo {
  /** Length in the path's own (pre-transform) units — the units dash arrays use. */
  length: number
  /** Centre in layer space, for left→right / top→bottom ordering. */
  cx: number
  cy: number
}

export interface WobbleParams {
  amount: number // layer px
  size: number // layer px: feature size of the noise (bigger = smoother)
  spacing: number // layer px: longest straight run before it is split so it can bend
  cycle: number // 0..1 position in the loop (already quantised for "boil")
  radius: number // how fast the noise moves around its loop
  seed: number
}

/** Per-path animated state (docs/adr/0011). Defaults are the resting state. */
export interface PathFrame {
  /** 0..1 of the stroke revealed (min of in/out contributions). */
  draw: number
  /** Multiplies the path's opacity. */
  opacity: number
  /** Multiplies the fill's alpha only. */
  fillOpacity: number
  /** Extra vertical offset, layer px. */
  rise: number
  /** How a dashed stroke is revealed: whole dashes pop in, or the last one grows. */
  dashMode: 'pop' | 'grow'
  /** Fill-only paths get a temporary stroke so there is something to draw. */
  outline?: { width: number }
  /** 0..1 multiplier on the outline width — it thins away as the fill takes over. */
  outlineFactor: number
  /** Marching dashes: `phase` is in pattern lengths; dash/gap are multiples of the stroke width. */
  flow?: { phase: number; dash: number; gap: number }
  wobble?: WobbleParams
}

export const identityPathFrame = (): PathFrame => ({
  draw: 1,
  opacity: 1,
  fillOpacity: 1,
  rise: 0,
  dashMode: 'pop',
  outlineFactor: 0,
})

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
  /** Per-path state; only present when a path preset is active on an svg/shape layer. */
  paths?: PathFrame[]
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
  /** in/out: linear progress 0..1 *before* easing (1 = at rest); path presets ease per path. */
  u: number
  /** This animation's easing, for presets that ease per path. */
  ease: (x: number) => number
  /** Path presets: measured paths of the layer (empty for other layers). */
  infos: PathInfo[]
}
