import Konva from 'konva'
import type { Layer, PosterDoc, StrokeStyle } from '../types/poster'
import { renderGenerator } from '../generators/runtime'
import { strokeDash } from '../canvas/stroke'

const GENERATOR_CAP = 2048

function fontStyleString(weight: number | string, italic: boolean) {
  return `${italic ? 'italic ' : ''}${weight}`
}

/** A border rect stroked just inside a w×h box, matching the live canvas. */
function borderRect(
  w: number,
  h: number,
  stroke: string,
  strokeWidth: number,
  strokeStyle: StrokeStyle | undefined,
): Konva.Rect {
  const dash = strokeDash(strokeStyle, strokeWidth)
  return new Konva.Rect({
    x: strokeWidth / 2,
    y: strokeWidth / 2,
    width: Math.max(0, w - strokeWidth),
    height: Math.max(0, h - strokeWidth),
    stroke,
    strokeWidth,
    dash: dash.dash,
    lineCap: dash.lineCap,
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Build the inner Konva shape for a layer at local (0,0). */
function buildShape(
  layer: Layer,
  t: number,
  pixelRatio: number,
  images: Map<string, HTMLImageElement>,
): Konva.Shape | Konva.Group | null {
  switch (layer.type) {
    case 'rect': {
      const dash = strokeDash(layer.strokeStyle, layer.strokeWidth ?? 0)
      return new Konva.Rect({
        width: layer.width,
        height: layer.height,
        fill: layer.fill,
        cornerRadius: layer.cornerRadius,
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        dash: dash.dash,
        lineCap: dash.lineCap,
      })
    }
    case 'ellipse': {
      const dash = strokeDash(layer.strokeStyle, layer.strokeWidth ?? 0)
      return new Konva.Ellipse({
        x: layer.width / 2,
        y: layer.height / 2,
        radiusX: layer.width / 2,
        radiusY: layer.height / 2,
        fill: layer.fill,
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        dash: dash.dash,
        lineCap: dash.lineCap,
      })
    }
    case 'text': {
      const text = new Konva.Text({
        width: layer.width,
        text: layer.text,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontStyle: fontStyleString(layer.fontWeight, layer.fontStyle === 'italic'),
        fill: layer.fill,
        align: layer.align,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing,
        wrap: 'word',
      })
      const sw = layer.strokeWidth ?? 0
      if (sw > 0 && layer.stroke) {
        const group = new Konva.Group()
        group.add(text)
        group.add(borderRect(layer.width, text.height(), layer.stroke, sw, layer.strokeStyle))
        return group
      }
      return text
    }
    case 'image': {
      const img = images.get(layer.id)
      if (!img) return null
      const image = new Konva.Image({
        image: img,
        width: layer.width,
        height: layer.height,
      })
      const sw = layer.strokeWidth ?? 0
      if (sw > 0 && layer.stroke) {
        const group = new Konva.Group()
        group.add(image)
        group.add(borderRect(layer.width, layer.height, layer.stroke, sw, layer.strokeStyle))
        return group
      }
      return image
    }
    case 'generator': {
      const long = Math.max(layer.width, layer.height) * pixelRatio
      const scale = Math.min(1, GENERATOR_CAP / long)
      const iw = Math.max(1, Math.round(layer.width * pixelRatio * scale))
      const ih = Math.max(1, Math.round(layer.height * pixelRatio * scale))
      const canvas = document.createElement('canvas')
      canvas.width = iw
      canvas.height = ih
      const ctx = canvas.getContext('2d')!
      renderGenerator(ctx, iw, ih, layer, t)
      return new Konva.Image({
        image: canvas,
        width: layer.width,
        height: layer.height,
      })
    }
  }
}

/**
 * Render the whole poster to a fresh canvas at `artboard * pixelRatio`, at the
 * given time t. Used for crisp PNG/JPG export and per-frame MP4 capture.
 * Excludes the transformer and view transform entirely.
 */
export async function renderSceneToCanvas(
  doc: PosterDoc,
  t: number,
  pixelRatio: number,
): Promise<HTMLCanvasElement> {
  const { width: W, height: H, background } = doc.artboard

  // Preload image layers.
  const images = new Map<string, HTMLImageElement>()
  await Promise.all(
    doc.layers
      .filter((l) => l.type === 'image' && l.visible && l.src)
      .map(async (l) => {
        try {
          images.set(l.id, await loadImage((l as { src: string }).src))
        } catch {
          /* skip broken images */
        }
      }),
  )

  const container = document.createElement('div')
  const stage = new Konva.Stage({
    container,
    width: Math.round(W * pixelRatio),
    height: Math.round(H * pixelRatio),
  })
  const layer = new Konva.Layer({
    clip: { x: 0, y: 0, width: W, height: H },
  })
  layer.scale({ x: pixelRatio, y: pixelRatio })
  stage.add(layer)

  layer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: background }))

  for (const l of doc.layers) {
    if (!l.visible) continue
    const shape = buildShape(l, t, pixelRatio, images)
    if (!shape) continue
    const group = new Konva.Group({
      x: l.x,
      y: l.y,
      rotation: l.rotation,
      opacity: l.opacity,
      globalCompositeOperation: l.blendMode,
    })
    group.add(shape)
    layer.add(group)
  }

  layer.draw()
  const canvas = layer.toCanvas({ pixelRatio: 1 }) as HTMLCanvasElement
  stage.destroy()
  return canvas
}
