// Turn per-path animation state (PathFrame) into the VectorPaths that get drawn
// (docs/adr/0011). Pure: the measured lengths arrive as PathInfo.
import type { Paint, VectorPath } from '../types/poster'
import type { PathFrame, PathInfo } from '../animation/types'
import { cleanPattern, patternLength, revealDash } from '../animation/dash'
import { loopNoiseAt } from '../animation/noise'
import { displaceSegments, displaceSegs, preparedSegments } from '../animation/wobble'
import { withAlpha } from '../svg/color'
import { multiply } from './matrix'

const EPS = 1e-6

export function isIdentityPathFrame(f: PathFrame): boolean {
  return (
    f.draw >= 1 &&
    f.opacity === 1 &&
    f.fillOpacity === 1 &&
    f.rise === 0 &&
    !f.flow &&
    !f.wobble &&
    !(f.outline && f.outlineFactor > EPS)
  )
}

/** Scale a paint's alpha (solid colour or every gradient stop). */
export function paintWithAlpha(paint: Paint | null, factor: number): Paint | null {
  if (!paint || factor >= 1) return paint
  if (paint.type === 'solid') return { ...paint, color: withAlpha(paint.color, factor) }
  return { ...paint, stops: paint.stops.map((s) => ({ ...s, color: withAlpha(s.color, factor) })) }
}

const firstColor = (paint: Paint): string =>
  paint.type === 'solid' ? paint.color : (paint.stops[0]?.color ?? '#000000')

/** Uniform scale of a path's transform, to turn layer px into local units. */
const localScale = (m: VectorPath['transform']) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1

/** Wobble a path; works on animated numeric geometry too, so a character can bend and wobble in one pass. */
function wobbled(path: VectorPath, f: NonNullable<PathFrame['wobble']>): Pick<VectorPath, 'd' | 'segs'> {
  const sc = localScale(path.transform)
  const [a, b, c, d, e, g] = path.transform
  const freq = 1 / Math.max(1, f.size)
  const amountLocal = f.amount / sc
  const displace = (x: number, y: number): [number, number] => {
    // Sample the field in layer space so the look doesn't depend on viewBox units.
    const lx = a * x + c * y + e
    const ly = b * x + d * y + g
    return [
      amountLocal * loopNoiseAt(f.seed, 0, lx * freq, ly * freq, f.cycle, f.radius),
      amountLocal * loopNoiseAt(f.seed, 1, lx * freq, ly * freq, f.cycle, f.radius),
    ]
  }
  // Animated character geometry is already subdivided finely enough to bend.
  if (path.segs) return { d: path.d, segs: displaceSegs(path.segs, displace) }
  return { d: displaceSegments(preparedSegments(path.d, f.spacing / sc), displace) }
}

/** Apply one path's frame. Returns the original object when nothing changes. */
function applyOne(path: VectorPath, f: PathFrame, info: PathInfo | undefined): VectorPath {
  if (isIdentityPathFrame(f)) return path
  const p: VectorPath = { ...path }
  const sc = localScale(path.transform)

  if (f.fillOpacity < 1) p.fill = paintWithAlpha(path.fill, f.fillOpacity)
  if (f.opacity !== 1) p.opacity = path.opacity * f.opacity

  // A fill-only path gets a temporary outline in its own colour so there is a stroke to draw.
  const hasStroke = !!path.stroke && path.strokeWidth > 0
  if (!hasStroke && f.outline && path.fill) {
    const w = (f.outline.width * f.outlineFactor) / sc
    if (w > EPS) {
      p.stroke = { type: 'solid', color: firstColor(path.fill) }
      p.strokeWidth = w
    }
  }
  const stroked = !!p.stroke && p.strokeWidth > 0

  if (stroked && info) {
    // Marching dashes use the path's own pattern when it has one (so dots flow as dots).
    let pattern = cleanPattern(path.dash)
    let offset = 0
    if (f.flow) {
      pattern ??= [f.flow.dash * p.strokeWidth, f.flow.gap * p.strokeWidth]
      offset = f.flow.phase * patternLength(pattern)
    }
    if (f.draw < 1) {
      const r = revealDash(pattern, offset, f.draw * info.length, info.length, f.dashMode === 'pop')
      if (!r.visible) {
        p.stroke = null
        p.strokeWidth = 0
      } else {
        p.dash = r.dash
        p.dashOffset = r.offset
      }
    } else if (f.flow) {
      p.dash = pattern
      p.dashOffset = offset
    }
  }

  if (f.wobble && f.wobble.amount > 0) Object.assign(p, wobbled(path, f.wobble))
  if (f.rise !== 0) p.transform = multiply([1, 0, 0, 1, 0, f.rise], path.transform)
  return p
}

/** Apply per-path frames to a layer's paths (same order and length). */
export function applyPathFrames(
  paths: VectorPath[],
  frames: PathFrame[] | undefined,
  infos: PathInfo[],
): VectorPath[] {
  if (!frames) return paths
  return paths.map((p, i) => (frames[i] ? applyOne(p, frames[i], infos[i]) : p))
}
