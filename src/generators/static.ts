import { hexToRgb, mulberry32 } from './util'

type Params = Record<string, number | string | boolean>

export function renderStatic(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Params,
  t: number,
  seed: number,
) {
  const intensity = p.intensity as number // brightness 0..1
  const density = p.density as number // fraction of lit pixels 0..1
  const mono = p.mono as boolean
  const tint = hexToRgb(p.tint as string)
  const scanlines = p.scanlines as boolean

  // Deterministic per-frame field (so MP4 export reproduces exact frames).
  const frame = Math.floor(t * 60)
  const rnd = mulberry32((seed ^ Math.imul(frame + 1, 2654435761)) >>> 0)

  const img = ctx.createImageData(w, h)
  const data = img.data
  let i = 0
  for (let y = 0; y < h; y++) {
    const scan = scanlines && y % 2 === 0 ? 0.4 : 1
    for (let x = 0; x < w; x++) {
      if (rnd() > density) {
        data[i + 3] = 0
        i += 4
        continue
      }
      const v = rnd() * 255 * intensity * scan
      if (mono) {
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
      } else {
        data[i] = (tint[0] / 255) * v
        data[i + 1] = (tint[1] / 255) * v
        data[i + 2] = (tint[2] / 255) * v
      }
      data[i + 3] = 255
      i += 4
    }
  }
  ctx.putImageData(img, 0, 0)
}
