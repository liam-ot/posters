import { getLayerPaths } from '../render/paths'
import { closeGaps, fillHoles, meshFromMask, type Mask } from './mesh'
import { previewInstance } from './convert'
import type { PuppetAsset, PuppetMesh } from './types'
import { meshKey } from './meshKey'

export { isMeshCurrent, meshKey } from './meshKey'

const RESOLUTION = 512 // longest side of the silhouette raster, px
const PAD = 8 // empty border so closing/filling never touch the edge
const CLOSE_RADIUS = 2 // bridges hairline breaks in traced line art

/**
 * Rasterise the character's visible paths (fills and strokes, any colour) into
 * a filled silhouette mask. Browser-only (canvas).
 */
export function silhouetteMask(asset: PuppetAsset): { mask: Mask; scale: number } {
  const { width, height } = asset.size
  const scale = RESOLUTION / Math.max(width, height)
  const w = Math.ceil(width * scale) + PAD * 2
  const h = Math.ceil(height * scale) + PAD * 2
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'

  for (const p of getLayerPaths(previewInstance(asset))) {
    if (!p.visible || (!p.fill && !p.stroke)) continue
    const [a, b, c, d, e, f] = p.transform
    ctx.setTransform(a * scale, b * scale, c * scale, d * scale, e * scale + PAD, f * scale + PAD)
    const path = new Path2D(p.d)
    if (p.fill) ctx.fill(path, p.fillRule)
    if (p.stroke && p.strokeWidth > 0) {
      ctx.lineWidth = p.strokeWidth
      ctx.lineCap = p.lineCap
      ctx.lineJoin = p.lineJoin
      ctx.miterLimit = p.miterLimit
      ctx.stroke(path)
    }
  }

  const { data } = ctx.getImageData(0, 0, w, h)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] > 64 ? 1 : 0
  return { mask: fillHoles(closeGaps({ w, h, data: out }, CLOSE_RADIUS)), scale }
}

const round = (x: number) => Math.round(x * 1000) / 1000

/** Build the character's mesh, in character space. */
export function buildMesh(asset: PuppetAsset): PuppetMesh {
  const { mask, scale } = silhouetteMask(asset)
  const raw = meshFromMask(mask, { detail: asset.puppet.detail })
  return {
    key: meshKey(asset),
    verts: raw.verts.flatMap(([x, y]) => [round((x - PAD) / scale), round((y - PAD) / scale)]),
    tris: raw.tris.flat(),
  }
}
