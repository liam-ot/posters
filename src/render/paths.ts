import type { PathConfig } from 'konva/lib/shapes/Path'
import type { ShapeLayer, SvgLayer, VectorPath } from '../types/poster'
import { generateShape, SHAPES } from '../shapes/library'
import { strokeDash } from '../canvas/stroke'
import { decomposeMatrix, multiply } from './matrix'
import { paintProps } from './paint'

/**
 * Shape layers regenerate their
 * geometry at the layer's real size (so stroke widths stay true pixels on
 * resize) and inset it by half the stroke so the stroke stays inside the box,
 * matching how borders behave on other layers (docs/adr/0007).
 */
function shapePaths(layer: ShapeLayer): VectorPath[] {
  const def = SHAPES[layer.shape]
  const sw = layer.stroke ? (layer.strokeWidth ?? 0) : 0
  const inset = sw / 2
  const geoms = generateShape(
    layer.shape,
    layer.params,
    layer.width - sw,
    layer.height - sw,
  )
  const dash = strokeDash(layer.strokeStyle, sw)
  const lineCap =
    layer.strokeStyle === 'dotted' ? 'round' : (layer.lineCap ?? (def.line ? 'round' : 'butt'))

  return geoms.map((g, i) => ({
    id: `${layer.id}:${i}`,
    d: g.d,
    transform: [1, 0, 0, 1, inset, inset],
    fill: layer.fill ? { type: 'solid', color: layer.fill } : null,
    stroke: sw > 0 && layer.stroke ? { type: 'solid', color: layer.stroke } : null,
    strokeWidth: sw,
    lineCap,
    lineJoin: 'round',
    miterLimit: 4,
    dash: dash.dash,
    fillRule: g.fillRule,
    opacity: 1,
    visible: true,
  }))
}

const svgCache = new WeakMap<VectorPath[], { key: string; out: VectorPath[] }>()

/**
 * An SVG layer stretches its viewBox over the layer box (like
 * preserveAspectRatio="none"), so the scale goes into each path's transform —
 * strokes scale with it, as they do in SVG. Cached per (paths, box).
 */
function svgPaths(layer: SvgLayer): VectorPath[] {
  const { viewBox: vb } = layer
  const key = `${layer.width}x${layer.height}|${vb.x},${vb.y},${vb.width},${vb.height}`
  const hit = svgCache.get(layer.paths)
  if (hit && hit.key === key) return hit.out
  const sx = layer.width / vb.width
  const sy = layer.height / vb.height
  const base: [number, number, number, number, number, number] = [sx, 0, 0, sy, -vb.x * sx, -vb.y * sy]
  const out = layer.paths.map((p) => ({ ...p, transform: multiply(base, p.transform) }))
  svgCache.set(layer.paths, { key, out })
  return out
}

/** The vector paths of a shape or SVG layer, in layer space. */
export function getLayerPaths(layer: ShapeLayer | SvgLayer): VectorPath[] {
  return layer.type === 'svg' ? svgPaths(layer) : shapePaths(layer)
}

/** Konva.Path props for one vector path — shared by the live canvas and export. */
export function pathConfig(path: VectorPath): PathConfig {
  return {
    data: path.d,
    ...decomposeMatrix(path.transform),
    ...paintProps('fill', path.fill),
    ...paintProps('stroke', path.stroke),
    strokeWidth: path.stroke ? path.strokeWidth : 0,
    lineCap: path.lineCap,
    lineJoin: path.lineJoin,
    miterLimit: path.miterLimit,
    dash: path.dash,
    fillRule: path.fillRule,
    opacity: path.opacity,
  } as PathConfig
}

export interface PathNode {
  key: string
  config: PathConfig
}

/** Visible paths of a layer as ready-to-render Konva.Path configs. */
export function pathNodeConfigs(layer: ShapeLayer | SvgLayer): PathNode[] {
  return getLayerPaths(layer)
    .filter((p) => p.visible)
    .map((p) => ({ key: p.id, config: pathConfig(p) }))
}
