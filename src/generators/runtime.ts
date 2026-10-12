import type { GeneratorLayer } from '../types/poster'
import { GENERATORS } from './config'
import { renderNoise } from './noise'
import { renderStatic } from './static'
import { renderPattern } from './pattern'
import { SHADERS, type ShaderGenerator } from './shaders'
import { renderShader } from './gl'
import { loopClock } from './loopTime'

const MAX_DIM = 512

/** Internal render resolution (capped for performance, scaled up by Konva). */
export function internalSize(w: number, h: number) {
  const s = Math.min(1, MAX_DIM / Math.max(w, h))
  return { iw: Math.max(1, Math.round(w * s)), ih: Math.max(1, Math.round(h * s)) }
}

/** Is this generator drawn by a WebGL shader? */
export const isShaderGenerator = (layer: GeneratorLayer) => !!SHADERS[layer.generator]

function renderShaderGenerator(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shader: ShaderGenerator,
  p: Record<string, number | string | boolean>,
  t: number,
  loopSec: number,
  seed: number,
) {
  const clock = loopClock(t, loopSec, Number(p.speed ?? 0), shader.rates)
  const src = renderShader(shader.frag, w, h, {
    ...shader.uniforms(p, { t, loopSec, seed }),
    u_phase: clock.phase,
    u_drift: clock.drift,
    u_evo: clock.evo,
    u_seed: (seed % 100000) / 100000,
  })
  ctx.clearRect(0, 0, w, h)
  if (src) {
    ctx.drawImage(src, 0, 0)
  } else {
    ctx.fillStyle = shader.fallback(p)
    ctx.fillRect(0, 0, w, h)
  }
}

/**
 * Render a generator layer into a 2D context at time t (seconds). `loopSec` is
 * the poster's duration: shader generators loop exactly over it (docs/adr/0004).
 */
export function renderGenerator(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layer: GeneratorLayer,
  t: number,
  loopSec: number,
) {
  const p = { ...GENERATORS[layer.generator].defaults, ...layer.params }
  const shader = SHADERS[layer.generator]
  if (shader) return renderShaderGenerator(ctx, w, h, shader, p, t, loopSec, layer.seed)
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
