import type { PathConfig } from 'konva/lib/shapes/Path'
import type { ShapeLayer, SvgLayer, VectorPath } from '../types/poster'
import type { PuppetLayer } from '../puppet/types'
import { instanceSource } from '../puppet/source'
import { posedPathData } from '../puppet/deform'
import { generateShape, SHAPES } from '../shapes/library'
import { strokeDash } from '../canvas/stroke'
import type { PathFrame, PathInfo } from '../animation/types'
import { decomposeMatrix, multiply } from './matrix'
import { applyPathFrames } from './pathFrames'
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
 * SVG artwork stretches its viewBox over the layer box (like
 * preserveAspectRatio="none"), so the scale goes into each path's transform —
 * strokes scale with it, as they do in SVG. Cached per (paths, box). Used by SVG
 * layers and by character instances (docs/adr/0013).
 */
function viewBoxPaths(
  paths: VectorPath[],
  vb: SvgLayer['viewBox'],
  width: number,
  height: number,
): VectorPath[] {
  const key = `${width}x${height}|${vb.x},${vb.y},${vb.width},${vb.height}`
  const hit = svgCache.get(paths)
  if (hit && hit.key === key) return hit.out
  const sx = width / vb.width
  const sy = height / vb.height
  const base: [number, number, number, number, number, number] = [sx, 0, 0, sy, -vb.x * sx, -vb.y * sy]
  const out = paths.map((p) => ({ ...p, transform: multiply(base, p.transform) }))
  svgCache.set(paths, { key, out })
  return out
}

const posedCache = new WeakMap<VectorPath[], { data: string[]; out: VectorPath[] }>()

/** The instance's paths bent into its pose (docs/adr/0012); the same array when unposed. */
function posePaths(layer: PuppetLayer, paths: VectorPath[]): VectorPath[] {
  const data = posedPathData(layer.snapshot, layer.motionId)
  if (!data) return paths
  const hit = posedCache.get(paths)
  if (hit && hit.data === data) return hit.out
  const out = paths.map((p, i) => ({ ...p, d: data[i] }))
  posedCache.set(paths, { data, out })
  return out
}

export type PathLayer = ShapeLayer | SvgLayer | PuppetLayer

/** The vector paths of a shape, SVG or character layer, in layer space. */
export function getLayerPaths(layer: PathLayer): VectorPath[] {
  switch (layer.type) {
    case 'svg':
      return viewBoxPaths(layer.paths, layer.viewBox, layer.width, layer.height)
    case 'puppet': {
      const src = instanceSource(layer)
      return viewBoxPaths(posePaths(layer, src.paths), src.viewBox, layer.width, layer.height)
    }
    case 'shape':
      return shapePaths(layer)
  }
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
    dashOffset: path.dashOffset,
    fillRule: path.fillRule,
    opacity: path.opacity,
  } as PathConfig
}

export interface PathNode {
  key: string
  config: PathConfig
}

/**
 * Visible paths of a layer as ready-to-render Konva.Path configs. With per-path
 * animation `frames` (and the paths' measured `infos`) they are animated first.
 */
export function pathNodeConfigs(
  layer: PathLayer,
  frames?: PathFrame[],
  infos: PathInfo[] = [],
): PathNode[] {
  return applyPathFrames(getLayerPaths(layer), frames, infos)
    .filter((p) => p.visible)
    .map((p) => ({ key: p.id, config: pathConfig(p) }))
}
