import type { Paint } from '../types/poster'

type Props = Record<string, unknown>

const flatStops = (stops: { offset: number; color: string }[]) =>
  stops.flatMap((s) => [s.offset, s.color])

/**
 * Konva props for a fill or stroke paint. Gradient coordinates are in the
 * path's own space, which is also where Konva evaluates them.
 * Konva has no radial *stroke* gradient, so that case falls back to the first
 * stop's colour.
 */
export function paintProps(kind: 'fill' | 'stroke', paint: Paint | null): Props {
  if (!paint) return {}
  switch (paint.type) {
    case 'solid':
      return { [kind]: paint.color }
    case 'linear':
      return {
        [`${kind}LinearGradientStartPoint`]: { x: paint.x1, y: paint.y1 },
        [`${kind}LinearGradientEndPoint`]: { x: paint.x2, y: paint.y2 },
        [`${kind}LinearGradientColorStops`]: flatStops(paint.stops),
      }
    case 'radial':
      if (kind === 'stroke') return { stroke: paint.stops[0]?.color }
      return {
        fillRadialGradientStartPoint: { x: paint.fx, y: paint.fy },
        fillRadialGradientStartRadius: 0,
        fillRadialGradientEndPoint: { x: paint.cx, y: paint.cy },
        fillRadialGradientEndRadius: paint.r,
        fillRadialGradientColorStops: flatStops(paint.stops),
      }
  }
}
