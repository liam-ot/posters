import type { Paint, VectorPath } from '../types/poster'
import { replaceRgb, rgbHex } from './color'

export interface Swatch {
  hex: string // opaque #rrggbb
  count: number // how many fills/strokes/gradient stops use it
}

function paintColors(paint: Paint | null): string[] {
  if (!paint) return []
  return paint.type === 'solid' ? [paint.color] : paint.stops.map((s) => s.color)
}

/** Unique colours used by a layer's paths, most used first (Canva-style palette). */
export function collectSwatches(paths: VectorPath[]): Swatch[] {
  const counts = new Map<string, number>()
  for (const p of paths) {
    for (const c of [...paintColors(p.fill), ...paintColors(p.stroke)]) {
      const hex = rgbHex(c)
      if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1)
    }
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
}

function recolorPaint(paint: Paint | null, from: string, to: string): Paint | null {
  if (!paint) return paint
  if (paint.type === 'solid') {
    return rgbHex(paint.color) === from ? { ...paint, color: replaceRgb(paint.color, to) } : paint
  }
  return {
    ...paint,
    stops: paint.stops.map((s) =>
      rgbHex(s.color) === from ? { ...s, color: replaceRgb(s.color, to) } : s,
    ),
  }
}

/** Replace one palette colour everywhere it appears. Each paint keeps its own alpha. */
export function replaceSwatch(paths: VectorPath[], from: string, to: string): VectorPath[] {
  return paths.map((p) => {
    const fill = recolorPaint(p.fill, from, to)
    const stroke = recolorPaint(p.stroke, from, to)
    return fill === p.fill && stroke === p.stroke ? p : { ...p, fill, stroke }
  })
}

function remapPaint(paint: Paint | null, map: Record<string, string>): Paint | null {
  if (!paint) return paint
  const swap = (c: string) => {
    const to = map[rgbHex(c) ?? '']
    return to ? replaceRgb(c, to) : c
  }
  if (paint.type === 'solid') {
    const color = swap(paint.color)
    return color === paint.color ? paint : { ...paint, color }
  }
  const stops = paint.stops.map((s) => {
    const color = swap(s.color)
    return color === s.color ? s : { ...s, color }
  })
  return stops.every((s, i) => s === paint.stops[i]) ? paint : { ...paint, stops }
}

/**
 * Apply several swatch replacements at once (original hex → new hex). Unlike
 * chained `replaceSwatch` calls, a → b, b → c can't cascade a into c.
 */
export function remapSwatches(paths: VectorPath[], map: Record<string, string>): VectorPath[] {
  if (Object.keys(map).length === 0) return paths
  return paths.map((p) => {
    const fill = remapPaint(p.fill, map)
    const stroke = remapPaint(p.stroke, map)
    return fill === p.fill && stroke === p.stroke ? p : { ...p, fill, stroke }
  })
}
