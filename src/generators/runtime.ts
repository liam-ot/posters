import type { GeneratorLayer } from '../types/poster'
import { GENERATORS } from './config'
import { renderNoise } from './noise'
import { renderStatic } from './static'
import { renderPattern } from './pattern'

const MAX_DIM = 512

/** Internal render resolution (capped for performance, scaled up by Konva). */
export function internalSize(w: number, h: number) {
  const s = Math.min(1, MAX_DIM / Math.max(w, h))
  return { iw: Math.max(1, Math.round(w * s)), ih: Math.max(1, Math.round(h * s)) }
}

/** Render a generator layer into a 2D context at time t (seconds). */
export function renderGenerator(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layer: GeneratorLayer,
  t: number,
) {
  const p = { ...GENERATORS[layer.generator].defaults, ...layer.params }
  switch (layer.generator) {
    case 'noise':
      renderNoise(ctx, w, h, p, t, layer.seed)
      break
    case 'static':
      renderStatic(ctx, w, h, p, t, layer.seed)
      break
    case 'pattern':
      renderPattern(ctx, w, h, p, t)
      break
  }
}
