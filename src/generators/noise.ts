import { createNoise3D } from 'simplex-noise'
import { hexToRgb, lerpRgb, mulberry32, type RGB } from './util'

type Params = Record<string, number | string | boolean>

// Memoize noise field per seed so we don't rebuild the permutation each frame.
const noiseCache = new Map<number, ReturnType<typeof createNoise3D>>()
function noiseFor(seed: number) {
  let n = noiseCache.get(seed)
  if (!n) {
    n = createNoise3D(mulberry32(seed))
    noiseCache.set(seed, n)
  }
  return n
}

export function renderNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Params,
  t: number,
  seed: number,
) {
  const freq = (p.scale as number) / 1000 // 1..100 -> fine..coarse
  const speed = p.speed as number
  const contrast = p.contrast as number
  const mono = p.mono as boolean
  const a = hexToRgb(p.colorA as string)
  const b = hexToRgb(p.colorB as string)
  const noise = noiseFor(seed)
  const z = t * speed

  const img = ctx.createImageData(w, h)
  const data = img.data
  let i = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = (noise(x * freq, y * freq, z) + 1) / 2
      n = Math.min(1, Math.max(0, (n - 0.5) * contrast + 0.5))
      let c: RGB
      if (mono) c = [n * 255, n * 255, n * 255]
      else c = lerpRgb(a, b, n)
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
      i += 4
    }
  }
  ctx.putImageData(img, 0, 0)
}
