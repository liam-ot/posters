// Pure Konva node configs shared by the live canvas (react-konva) and the
// export renderer (imperative Konva). See docs/adr/0002. Rule: no drawing
// decision lives in only one renderer — add it here and consume it in both.
//
// These cover *drawing* props only. Interaction (events, refs, names used to
// find nodes during a transform) stays in the live renderer.
import type { EllipseConfig } from 'konva/lib/shapes/Ellipse'
import type { RectConfig } from 'konva/lib/shapes/Rect'
import type { TextConfig } from 'konva/lib/shapes/Text'
import type { GroupConfig } from 'konva/lib/Group'
import type {
  EllipseLayer,
  GeneratorLayer,
  ImageLayer,
  Layer,
  RectLayer,
  StrokeStyle,
  TextLayer,
} from '../types/poster'
import { strokeDash } from '../canvas/stroke'

/** Konva fontStyle string from weight + italic. */
export function fontStyleString(weight: number | string, italic: boolean) {
  return `${italic ? 'italic ' : ''}${weight}`
}

/** Props for the outer per-layer group (position, rotation, opacity, blend). */
export function layerGroupConfig(layer: Layer): GroupConfig {
  return {
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.visible ? layer.opacity : 0,
    globalCompositeOperation: layer.blendMode,
  }
}

export function rectConfig(layer: RectLayer): RectConfig {
  const dash = strokeDash(layer.strokeStyle, layer.strokeWidth ?? 0)
  return {
    width: layer.width,
    height: layer.height,
    fill: layer.fill,
    cornerRadius: layer.cornerRadius,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    dash: dash.dash,
    lineCap: dash.lineCap,
  }
}

export function ellipseConfig(layer: EllipseLayer): EllipseConfig {
  const dash = strokeDash(layer.strokeStyle, layer.strokeWidth ?? 0)
  return {
    x: layer.width / 2,
    y: layer.height / 2,
    radiusX: layer.width / 2,
    radiusY: layer.height / 2,
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    dash: dash.dash,
    lineCap: dash.lineCap,
  }
}

export function textConfig(layer: TextLayer): TextConfig {
  return {
    width: layer.width,
    text: layer.text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: fontStyleString(layer.fontWeight, layer.fontStyle === 'italic'),
    fill: layer.fill,
    align: layer.align,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    wrap: 'word',
  }
}

/** Size of a layer's bitmap content (image or generator output). */
export function bitmapConfig(layer: ImageLayer | GeneratorLayer) {
  return { width: layer.width, height: layer.height }
}

/**
 * A border stroked just inside the perimeter of a w×h box. Inset by half the
 * stroke width so the whole stroke sits inside the box edge.
 */
export function borderConfig(
  w: number,
  h: number,
  stroke: string,
  strokeWidth: number,
  strokeStyle?: StrokeStyle,
  cornerRadius?: number,
): RectConfig {
  const dash = strokeDash(strokeStyle, strokeWidth)
  return {
    x: strokeWidth / 2,
    y: strokeWidth / 2,
    width: Math.max(0, w - strokeWidth),
    height: Math.max(0, h - strokeWidth),
    stroke,
    strokeWidth,
    cornerRadius,
    dash: dash.dash,
    lineCap: dash.lineCap,
  }
}

/** The border to draw for a text/image layer, or null when it has none. */
export function layerBorder(
  layer: TextLayer | ImageLayer,
): { stroke: string; strokeWidth: number; strokeStyle?: StrokeStyle } | null {
  const strokeWidth = layer.strokeWidth ?? 0
  if (strokeWidth > 0 && layer.stroke) {
    return { stroke: layer.stroke, strokeWidth, strokeStyle: layer.strokeStyle }
  }
  return null
}
