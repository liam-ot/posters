import Konva from 'konva'
import type { ShapeLayer, SvgLayer } from '../types/poster'
import type { PathInfo } from '../animation/types'
import { getLayerPaths } from './paths'

// Konva measures path data (length + bounds) once per distinct `d`.
const measured = new Map<string, { length: number; cx: number; cy: number }>()
const MEASURED_MAX = 5000

function measure(d: string) {
  let m = measured.get(d)
  if (!m) {
    const node = new Konva.Path({ data: d })
    const r = node.getSelfRect()
    m = { length: node.getLength(), cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
    if (measured.size >= MEASURED_MAX) measured.delete(measured.keys().next().value!)
    measured.set(d, m)
  }
  return m
}

const perLayer = new WeakMap<object, { key: string; out: PathInfo[] }>()

/**
 * Measured facts for each path of a layer (same order as `getLayerPaths`), which
 * path presets need for dash lengths and left→right / top→bottom ordering.
 * Cached per layer object and size, so it is cheap to call every frame.
 */
export function getPathInfos(layer: ShapeLayer | SvgLayer): PathInfo[] {
  const key = `${layer.width}x${layer.height}`
  const hit = perLayer.get(layer)
  if (hit && hit.key === key) return hit.out
  const out = getLayerPaths(layer).map((p) => {
    const m = measure(p.d)
    const [a, b, c, d, e, f] = p.transform
    return { length: m.length, cx: a * m.cx + c * m.cy + e, cy: b * m.cx + d * m.cy + f }
  })
  perLayer.set(layer, { key, out })
  return out
}

export const isPathLayer = (layer: { type: string }): layer is ShapeLayer | SvgLayer =>
  layer.type === 'shape' || layer.type === 'svg'
