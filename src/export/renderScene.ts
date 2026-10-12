import Konva from 'konva'
import type { Layer, PosterDoc } from '../types/poster'
import { renderGenerator } from '../generators/runtime'
import { measureTextHeight } from '../canvas/textMetrics'
import { pathNodeConfigs } from '../render/paths'
import { batchSceneFunc, canBatch, segsSceneFunc, type BatchItem } from '../render/segShape'
import { evaluateLayer } from '../animation/evaluate'
import { hasPathPresets } from '../animation/presets'
import type { PathFrame } from '../animation/types'
import { getPathInfos, isPathLayer } from '../render/pathInfo'
import { contextFor } from '../animation/timing'
import { instancePins } from '../puppet/pins'
import type { UV } from '../puppet/types'
import { animatedGroupConfig } from '../render/transform'
import {
  bitmapConfig,
  borderConfig,
  ellipseConfig,
  layerBorder,
  layerGroupConfig,
  rectConfig,
  textConfig,
} from '../render/configs'

const GENERATOR_CAP = 2048

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
  pathFrames?: PathFrame[],
  pins?: Map<string, UV>,
  loopSec = 0,
): Konva.Shape | Konva.Group | null {
  switch (layer.type) {
    case 'rect':
      return new Konva.Rect(rectConfig(layer))
    case 'ellipse':
      return new Konva.Ellipse(ellipseConfig(layer))
    case 'text': {
      const text = new Konva.Text(textConfig(layer))
      const border = layerBorder(layer)
      if (border) {
        const group = new Konva.Group()
        group.add(text)
        group.add(
          new Konva.Rect(
            borderConfig(
              layer.width,
              measureTextHeight(layer, layer.width),
              border.stroke,
              border.strokeWidth,
              border.strokeStyle,
            ),
          ),
        )
        return group
      }
      return text
    }
    case 'image': {
      const img = images.get(layer.id)
      if (!img) return null
      const image = new Konva.Image({ image: img, ...bitmapConfig(layer) })
      const border = layerBorder(layer)
      if (border) {
        const group = new Konva.Group()
        group.add(image)
        group.add(
          new Konva.Rect(
            borderConfig(
              layer.width,
              layer.height,
              border.stroke,
              border.strokeWidth,
              border.strokeStyle,
            ),
          ),
        )
        return group
      }
      return image
    }
    case 'shape':
    case 'svg':
    case 'puppet': {
      const group = new Konva.Group()
      const infos = pathFrames ? getPathInfos(layer) : undefined
      const nodes = pathNodeConfigs(layer, pathFrames, infos, pins)
      // Same choice as the live canvas (canvas/PathNodeView): batch animated character frames.
      if (nodes.length > 0 && canBatch(nodes)) {
        group.add(new Konva.Shape({ sceneFunc: batchSceneFunc(nodes as BatchItem[]), listening: false }))
      } else {
        for (const p of nodes) {
          group.add(p.segs ? new Konva.Shape({ ...p.config, sceneFunc: segsSceneFunc(p.segs) }) : new Konva.Path(p.config))
        }
      }
      return group
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
      renderGenerator(ctx, iw, ih, layer, t, loopSec)
      return new Konva.Image({ image: canvas, ...bitmapConfig(layer) })
    }
  }
}

/**
 * Render the whole poster to a fresh canvas at `artboard * pixelRatio`, at the
 * given time t (or, with `rest`, in its final un-animated state). Used for crisp
 * PNG/JPG export, thumbnails and per-frame MP4 capture. Excludes the transformer
 * and view transform entirely.
 */
export async function renderSceneToCanvas(
  doc: PosterDoc,
  t: number,
  pixelRatio: number,
  { rest = false }: { rest?: boolean } = {},
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

  const animCtx = contextFor(doc.timeline, rest)

  for (const l of doc.layers) {
    if (!l.visible) continue
    // Evaluate first: path presets need the layer's measured paths, and the
    // resulting per-path state feeds the shape builder.
    const infos = isPathLayer(l) && hasPathPresets(l) ? getPathInfos(l) : undefined
    const frame = evaluateLayer(l, t, animCtx, infos)
    const pins = l.type === 'puppet' ? instancePins(l, t, animCtx) : undefined
    const shape = buildShape(l, t, pixelRatio, images, frame.paths, pins, doc.timeline.durationSec)
    if (!shape) continue
    const group = new Konva.Group(layerGroupConfig(l))
    const inner = new Konva.Group(animatedGroupConfig(l, frame))
    inner.add(shape)
    group.add(inner)
    layer.add(group)
  }

  layer.draw()
  const canvas = layer.toCanvas({ pixelRatio: 1 }) as HTMLCanvasElement
  stage.destroy()
  return canvas
}

/**
 * JPG and MP4 can't store transparency (it would come out black), so a
 * transparent background or transparent areas are flattened onto white, as
 * design tools do for JPG. PNG keeps real transparency.
 */
export function flattenOnWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0)
  return out
}
