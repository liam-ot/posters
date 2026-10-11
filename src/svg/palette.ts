import type { Paint, VectorPath } from '../types/poster'
import { formatColor, parseColor, replaceRgb, rgbHex } from './color'

export interface Swatch {
  hex: string // opaque #rrggbb
  count: number // how many fills/strokes/gradient stops use it
  /** Opacity shared by every use, or 1 when they differ (then only the hue is shown). */
  alpha: number
}

function paintColors(paint: Paint | null): string[] {
  if (!paint) return []
  return paint.type === 'solid' ? [paint.color] : paint.stops.map((s) => s.color)
}

/** Unique colours used by a layer's paths, most used first (Canva-style palette). */
export function collectSwatches(paths: VectorPath[]): Swatch[] {
  const counts = new Map<string, number>()
  const alphas = new Map<string, number | null>()
  for (const p of paths) {
    for (const c of [...paintColors(p.fill), ...paintColors(p.stroke)]) {
      const hex = rgbHex(c)
      if (!hex) continue
      counts.set(hex, (counts.get(hex) ?? 0) + 1)
      const a = parseColor(c)?.a ?? 1
      const seen = alphas.get(hex)
      alphas.set(hex, seen === undefined ? a : seen === a ? a : null)
    }
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count, alpha: alphas.get(hex) ?? 1 }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
}

/** New colour for a use of a swatch: its own alpha kept, or `alpha` when given. */
function swapColor(color: string, to: string, alpha?: number): string {
  if (alpha === undefined) return replaceRgb(color, to)
  const c = parseColor(to)
  return c ? formatColor({ ...c, a: alpha }) : color
}

function recolorPaint(paint: Paint | null, from: string, to: string, alpha?: number): Paint | null {
  if (!paint) return paint
  if (paint.type === 'solid') {
    return rgbHex(paint.color) === from ? { ...paint, color: swapColor(paint.color, to, alpha) } : paint
  }
  return {
    ...paint,
    stops: paint.stops.map((s) =>
      rgbHex(s.color) === from ? { ...s, color: swapColor(s.color, to, alpha) } : s,
    ),
  }
}

/**
 * Replace one palette colour everywhere it appears. Each paint keeps its own
 * alpha, unless `alpha` is given (the opacity was changed) — then all get it.
 */
export function replaceSwatch(paths: VectorPath[], from: string, to: string, alpha?: number): VectorPath[] {
  return paths.map((p) => {
    const fill = recolorPaint(p.fill, from, to, alpha)
    const stroke = recolorPaint(p.stroke, from, to, alpha)
    return fill === p.fill && stroke === p.stroke ? p : { ...p, fill, stroke }
  })
}

function remapPaint(paint: Paint | null, map: Record<string, string>): Paint | null {
  if (!paint) return paint
  // An override written with alpha (#rrggbbaa) sets it; #rrggbb keeps each paint's own.
  const swap = (c: string) => {
    const to = map[rgbHex(c) ?? '']
    if (!to) return c
    return hasExplicitAlpha(to) ? swapColor(c, to, parseColor(to)!.a) : replaceRgb(c, to)
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

/** `#rrggbbaa` / `#rgba` — a colour that states its opacity. */
export const hasExplicitAlpha = (c: string) => /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(c.trim())
