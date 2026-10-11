// Core data model for a poster document.
// One PosterDoc is persisted as a single JSON file at data/posters/<id>.json.

import type { PuppetLayer } from '../puppet/types'

export type BlendMode = GlobalCompositeOperation

export interface ArtboardConfig {
  width: number
  height: number
  background: string
}

export interface TimelineConfig {
  durationSec: number
  fps: number
  loop: boolean
  /** Tempo for beat-synced loops. Unset = off (docs/adr/0005). */
  bpm?: number
  /** Beats per bar (default 4). */
  beatsPerBar?: number
}

// ── Animation (docs/adr/0001, 0005) ────────────────────────────────────────
export type AnimationPhase = 'in' | 'out' | 'loop'
export type TimeUnit = 'sec' | 'beat' | 'bar'
export type EasingName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backOut'
  | 'elasticOut'
  | 'bounceOut'

export type AnimationPresetId =
  | 'fade'
  | 'slide'
  | 'scale'
  | 'rotate'
  | 'pulse'
  | 'float'
  | 'spin'
  | 'sway'
  | 'jitter'
  | 'blink'
  | 'drawOn'
  | 'pathFade'
  | 'wobble'
  | 'dashFlow'

export interface LayerAnimation {
  id: string
  preset: AnimationPresetId
  phase: AnimationPhase
  enabled: boolean
  /** in: seconds after t=0 that the animation starts. */
  delay?: number
  /** out: seconds before the timeline end that the animation finishes. */
  endOffset?: number
  /** in/out: seconds the animation takes. */
  duration?: number
  /** loop: length of one cycle, in `periodUnit`. */
  period?: number
  periodUnit?: TimeUnit
  /** loop: shift by this fraction of a period (0..1), e.g. 0.5 = the off-beat. */
  phaseOffset?: number
  /** in/out only; loops ignore it. */
  easing: EasingName
  params: Record<string, number | string | boolean>
}

export type LayerType =
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'image'
  | 'generator'
  | 'shape'
  | 'svg'
  | 'puppet'

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export interface BaseLayer {
  id: string
  name: string
  type: LayerType
  x: number
  y: number
  width: number
  height: number
  rotation: number // degrees
  opacity: number // 0..1
  blendMode?: BlendMode
  visible: boolean
  locked: boolean
  clip?: boolean
  animations?: LayerAnimation[]
}

export interface RectLayer extends BaseLayer {
  type: 'rect'
  fill: string
  stroke?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
  cornerRadius?: number
}

export interface EllipseLayer extends BaseLayer {
  type: 'ellipse'
  fill: string
  stroke?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number | string
  fontStyle: 'normal' | 'italic'
  fill: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  stroke?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  src: string // data URL (inline) or /api asset path
  stroke?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
}

export type GeneratorKind = 'noise' | 'static' | 'pattern'

export interface GeneratorLayer extends BaseLayer {
  type: 'generator'
  generator: GeneratorKind
  animated: boolean
  seed: number
  params: Record<string, number | string | boolean>
}

// ── Vector paths (docs/adr/0007) ───────────────────────────────────────────
export interface GradientStop {
  offset: number // 0..1
  color: string // stop-opacity folded into the colour
}

/** Gradient coordinates are in the path's own (pre-transform) space. */
export type Paint =
  | { type: 'solid'; color: string }
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { type: 'radial'; cx: number; cy: number; r: number; fx: number; fy: number; stops: GradientStop[] }

export type Matrix2D = [number, number, number, number, number, number]

export interface VectorPath {
  id: string
  name?: string
  d: string
  /** local → layer space, kept per path so gradients stay exact. */
  transform: Matrix2D
  fill: Paint | null
  stroke: Paint | null
  strokeWidth: number
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
  miterLimit: number
  dash?: number[]
  dashOffset?: number
  fillRule: 'nonzero' | 'evenodd'
  opacity: number
  visible: boolean
}

// Built-in parametric shapes (docs/adr/0007). Geometry is derived at render time.
export type ShapeKind =
  | 'star'
  | 'polygon'
  | 'triangle'
  | 'burst'
  | 'ring'
  | 'arrow'
  | 'cross'
  | 'swoosh'
  | 'squiggle'
  | 'zigzag'
  | 'wave'
  | 'spiral'

export interface ShapeLayer extends BaseLayer {
  type: 'shape'
  shape: ShapeKind
  params: Record<string, number | string | boolean>
  fill: string | null
  stroke: string | null
  strokeWidth?: number
  strokeStyle?: StrokeStyle
  lineCap?: 'butt' | 'round' | 'square'
}

export interface SvgLayer extends BaseLayer {
  type: 'svg'
  /** Paths are in this coordinate system; the layer box stretches it (docs/adr/0007). */
  viewBox: { x: number; y: number; width: number; height: number }
  paths: VectorPath[]
  /** Sanitised source, kept for "reset colours" and "use flat image". */
  sourceSvg: string
  /** What the importer skipped or approximated. */
  importWarnings?: string[]
}

export type Layer =
  | RectLayer
  | EllipseLayer
  | TextLayer
  | ImageLayer
  | GeneratorLayer
  | ShapeLayer
  | SvgLayer
  | PuppetLayer

export interface PosterDoc {
  id: string
  name: string
  schemaVersion: 1
  createdAt: string
  updatedAt: string
  artboard: ArtboardConfig
  timeline: TimelineConfig
  layers: Layer[]
}

// Lightweight record used by the gallery / index.json.
export interface PosterSummary {
  id: string
  name: string
  updatedAt: string
  width: number
  height: number
}

// Persisted reference to a user-uploaded custom font.
export interface CustomFontMeta {
  id: string
  family: string // canonicalized family name used on canvas
  fileName: string
  ext: string
}
