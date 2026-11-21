import Konva from 'konva'
import type { PathConfig } from 'konva/lib/shapes/Path'
import type { Matrix2D } from '../types/poster'
import type { Seg } from '../animation/wobble'

/**
 * Scene function drawing numeric segments the way Konva.Path draws parsed path
 * data — same commands, same open/closed fill rule — so animated character
 * frames look identical to the stored geometry while skipping Konva's
 * JavaScript path parser (docs/adr/0012).
 */
export function segsSceneFunc(segs: Seg[]) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath()
    let closed = false
    for (const s of segs) {
      switch (s[0]) {
        case 'M':
          ctx.moveTo(s[1], s[2])
          break
        case 'L':
          ctx.lineTo(s[1], s[2])
          break
        case 'C':
          ctx.bezierCurveTo(s[1], s[2], s[3], s[4], s[5], s[6])
          break
        case 'Q':
          ctx.quadraticCurveTo(s[1], s[2], s[3], s[4])
          break
        case 'Z':
          closed = true
          ctx.closePath()
          break
      }
    }
    if (!closed && !shape.hasFill()) ctx.strokeShape(shape)
    else ctx.fillStrokeShape(shape)
  }
}

/** A path drawn inside a batch: its style, local → layer matrix and animated geometry. */
export interface BatchItem {
  key: string
  config: PathConfig
  segs: Seg[]
  matrix: Matrix2D
}

const sameValue = (a: unknown, b: unknown): boolean =>
  a === b ||
  (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]))

/**
 * One detached Konva.Shape per path, carrying its style for Konva's own
 * fill/stroke routine (gradients, dash, caps). Reused across frames; attrs are
 * only set when the style actually changed.
 */
export class StyleCache {
  private map = new Map<string, { cfg: PathConfig; shape: Konva.Shape }>()
  get(key: string, cfg: PathConfig): Konva.Shape {
    const hit = this.map.get(key)
    if (!hit) {
      const shape = new Konva.Shape(styleOnly(cfg))
      this.map.set(key, { cfg, shape })
      return shape
    }
    const keys = new Set([...Object.keys(hit.cfg), ...Object.keys(cfg)])
    const changed = [...keys].some((k) => k !== 'data' && !sameValue((hit.cfg as never)[k], (cfg as never)[k]))
    if (changed) {
      hit.shape.setAttrs(styleOnly(cfg))
      hit.cfg = cfg
    }
    return hit.shape
  }
}

/** Placement is applied from the raw matrix; the style shape stays at the origin. */
function styleOnly(cfg: PathConfig): PathConfig {
  return { ...cfg, data: undefined, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, opacity: 1 }
}

/**
 * Konva paints a semi-transparent shape that has both fill and stroke through a
 * buffer canvas (so the overlap doesn't double up); batching would skip that,
 * so such paths keep their own nodes.
 */
export function canBatch(items: { config: PathConfig; segs?: Seg[] }[]): boolean {
  return items.every((it) => {
    if (!it.segs) return false
    const c = it.config
    const op = c.opacity ?? 1
    const fill = !!c.fill || !!c.fillLinearGradientColorStops || !!c.fillRadialGradientColorStops
    const stroke = (!!c.stroke || !!c.strokeLinearGradientColorStops) && (c.strokeWidth ?? 0) > 0
    return !(op < 1 && fill && stroke)
  })
}

/**
 * Scene function drawing many animated paths in one node — what each Konva.Path
 * node would do (line join, miter, transform, opacity, fill/stroke), without
 * a scene-graph node per path. For characters with hundreds of paths
 * (docs/adr/0012).
 */
export function batchSceneFunc(items: BatchItem[], cache: StyleCache = new StyleCache()) {
  return (ctx: Konva.Context, _shape: Konva.Shape) => {
    const c = ctx as unknown as {
      _context: CanvasRenderingContext2D
      _applyLineJoin(s: Konva.Shape): void
      _applyMiterLimit(s: Konva.Shape): void
    }
    const base = c._context.globalAlpha
    for (const it of items) {
      const style = cache.get(it.key, it.config)
      ctx.save()
      c._applyLineJoin(style)
      c._applyMiterLimit(style)
      const m = it.matrix
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
      const op = it.config.opacity ?? 1
      if (op !== 1) ctx.setAttr('globalAlpha', base * op)
      segsSceneFunc(it.segs)(ctx, style)
      ctx.restore()
    }
  }
}
