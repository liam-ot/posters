import type { ArtboardConfig, ShapeLayer, SvgLayer } from '../types/poster'
import { getLayerPaths } from '../render/paths'
import { normalizeAsset, DEFAULT_MESH_DETAIL } from './normalize'
import type { PuppetAsset, PuppetLayer, VectorSource } from './types'

/**
 * Freeze an SVG or shape layer's artwork into a new library character
 * (docs/adr/0013). Its natural size is the layer's size, so an instance at the
 * same box draws exactly what the layer drew.
 */
export function assetFromLayer(
  layer: SvgLayer | ShapeLayer,
  id: string,
  now: string,
): PuppetAsset {
  const source: VectorSource =
    layer.type === 'svg'
      ? {
          viewBox: layer.viewBox,
          paths: layer.paths,
          sourceSvg: layer.sourceSvg,
          importWarnings: layer.importWarnings,
        }
      : // Shapes are regenerated at size; freeze the generated geometry in layer space.
        {
          viewBox: { x: 0, y: 0, width: layer.width, height: layer.height },
          paths: getLayerPaths(layer),
        }
  return {
    id,
    kind: 'puppet',
    schemaVersion: 1,
    name: layer.name,
    version: Date.now(),
    createdAt: now,
    updatedAt: now,
    size: { width: layer.width, height: layer.height },
    source,
    puppet: { detail: DEFAULT_MESH_DETAIL, pins: [] },
    motions: [],
  }
}

/** A new character from an imported SVG file, at the file's own size. */
export function assetFromSvg(
  svg: { name: string; viewBox: VectorSource['viewBox']; paths: VectorSource['paths']; sourceSvg: string; warnings: string[] },
  id: string,
  now: string,
): PuppetAsset {
  return normalizeAsset({
    id,
    kind: 'puppet',
    schemaVersion: 1,
    name: svg.name,
    version: Date.now(),
    createdAt: now,
    updatedAt: now,
    size: { width: svg.viewBox.width, height: svg.viewBox.height },
    source: {
      viewBox: svg.viewBox,
      paths: svg.paths,
      sourceSvg: svg.sourceSvg,
      importWarnings: svg.warnings.length ? svg.warnings : undefined,
    },
    puppet: { detail: DEFAULT_MESH_DETAIL, pins: [] },
    motions: [],
  })
}

/**
 * Replace a layer with a linked instance of `asset`, keeping everything that
 * isn't about its artwork: id, name, box, rotation, opacity, blend, visibility,
 * lock, clip and layer animations.
 */
export function instanceFromLayer(layer: SvgLayer | ShapeLayer, asset: PuppetAsset): PuppetLayer {
  return {
    id: layer.id,
    name: layer.name,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    visible: layer.visible,
    locked: layer.locked,
    clip: layer.clip,
    animations: layer.animations,
    type: 'puppet',
    assetId: asset.id,
    assetVersion: asset.version,
    snapshot: asset,
  }
}

/** Place a character on an artboard: natural size, scaled down to fit 80% if larger, centred. */
export function placeInstance(
  asset: PuppetAsset,
  artboard: ArtboardConfig,
  id: string,
): PuppetLayer {
  const { width: w, height: h } = asset.size
  const scale = Math.min(1, (artboard.width * 0.8) / w, (artboard.height * 0.8) / h)
  const width = Math.max(10, Math.round(w * scale))
  const height = Math.max(10, Math.round(h * scale))
  return {
    id,
    name: asset.name,
    x: Math.round((artboard.width - width) / 2),
    y: Math.round((artboard.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    type: 'puppet',
    assetId: asset.id,
    assetVersion: asset.version,
    motionId: asset.motions[0]?.id,
    snapshot: asset,
  }
}

/** An unplaced instance at the character's natural size — for the studio and thumbnails. */
export function previewInstance(asset: PuppetAsset): PuppetLayer {
  return {
    id: `preview:${asset.id}`,
    name: asset.name,
    x: 0,
    y: 0,
    width: asset.size.width,
    height: asset.size.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    type: 'puppet',
    assetId: asset.id,
    assetVersion: asset.version,
    snapshot: asset,
  }
}
