import { nanoid } from 'nanoid'
import type {
  ArtboardConfig,
  GeneratorKind,
  Layer,
  LayerType,
  PosterDoc,
} from '../types/poster'
import { defaultParams } from '../generators/config'
import { measureTextNatural } from '../canvas/textMetrics'

export const DEFAULT_ARTBOARD: ArtboardConfig = {
  width: 1080,
  height: 1320,
  background: '#0e0e12',
}

export function createDefaultDoc(name = 'Untitled poster'): PosterDoc {
  const now = new Date().toISOString()
  return {
    id: nanoid(),
    name,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    artboard: { ...DEFAULT_ARTBOARD },
    timeline: { durationSec: 5, fps: 30, loop: true },
    layers: [],
  }
}

const COLORS = ['#7c5cff', '#00d4ff', '#ff5c8a', '#ffd166', '#06d6a0']
function pickColor(n: number) {
  return COLORS[n % COLORS.length]
}

let createdCount = 0

interface CreateOpts {
  generator?: GeneratorKind
  src?: string
  naturalWidth?: number
  naturalHeight?: number
}

/** Build a new layer of the given type, centered on the artboard. */
export function createLayer(
  type: LayerType,
  artboard: ArtboardConfig,
  opts: CreateOpts = {},
): Layer {
  const n = createdCount++
  const base = {
    id: nanoid(),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  }

  const center = (w: number, h: number) => ({
    x: Math.round((artboard.width - w) / 2),
    y: Math.round((artboard.height - h) / 2),
  })

  switch (type) {
    case 'rect': {
      const width = 360
      const height = 240
      return {
        ...base,
        ...center(width, height),
        type: 'rect',
        name: `Rectangle ${n + 1}`,
        width,
        height,
        fill: pickColor(n),
        cornerRadius: 0,
        strokeWidth: 0,
      }
    }
    case 'ellipse': {
      const size = 300
      return {
        ...base,
        ...center(size, size),
        type: 'ellipse',
        name: `Ellipse ${n + 1}`,
        width: size,
        height: size,
        fill: pickColor(n),
        strokeWidth: 0,
      }
    }
    case 'text': {
      const style = {
        text: 'Your headline',
        fontFamily: 'Bebas Neue',
        fontSize: 96,
        fontWeight: 400,
        fontStyle: 'normal' as const,
        align: 'left' as const,
        lineHeight: 1.05,
        letterSpacing: 0,
      }
      // Size the box to hug the text so it starts at the text's own size.
      const { width, height } = measureTextNatural(style)
      return {
        ...base,
        ...center(width, height),
        type: 'text',
        name: 'Text',
        width,
        height,
        fill: '#ffffff',
        strokeWidth: 0,
        strokeStyle: 'solid',
        ...style,
      }
    }
    case 'image': {
      const maxW = artboard.width * 0.8
      const maxH = artboard.height * 0.8
      const nw = opts.naturalWidth || 600
      const nh = opts.naturalHeight || 600
      const scale = Math.min(maxW / nw, maxH / nh, 1)
      const width = Math.round(nw * scale)
      const height = Math.round(nh * scale)
      return {
        ...base,
        ...center(width, height),
        type: 'image',
        name: 'Image',
        width,
        height,
        src: opts.src || '',
      }
    }
    case 'generator': {
      const width = artboard.width
      const height = artboard.height
      const generator = opts.generator || 'noise'
      return {
        ...base,
        x: 0,
        y: 0,
        type: 'generator',
        name: generator[0].toUpperCase() + generator.slice(1),
        width,
        height,
        generator,
        animated: false,
        seed: Math.floor(Math.random() * 100000),
        params: defaultParams(generator),
      }
    }
  }
}
