// Core data model for a poster document.
// One PosterDoc is persisted as a single JSON file at data/posters/<id>.json.

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
}

export type LayerType = 'rect' | 'ellipse' | 'text' | 'image' | 'generator'

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

export type Layer =
  | RectLayer
  | EllipseLayer
  | TextLayer
  | ImageLayer
  | GeneratorLayer

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
