import { describe, expect, it } from 'vitest'
import type { PosterDoc, ShapeLayer, SvgLayer, VectorPath } from '../types/poster'
import { getLayerPaths } from '../render/paths'
import { remapSwatches } from '../svg/palette'
import { assetFromLayer, instanceFromLayer, placeInstance } from './convert'
import { linkedAssetIds, refreshSnapshots } from './link'
import { normalizeAsset } from './normalize'
import type { PuppetAsset, PuppetLayer } from './types'

const path = (id: string, fill: string, stroke?: string): VectorPath => ({
  id,
  d: 'M0 0L10 0L10 10Z',
  transform: [1, 0, 0, 1, 0, 0],
  fill: { type: 'solid', color: fill },
  stroke: stroke ? { type: 'solid', color: stroke } : null,
  strokeWidth: stroke ? 2 : 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 4,
  fillRule: 'nonzero',
  opacity: 1,
  visible: true,
})

const svgLayer: SvgLayer = {
  id: 'L1',
  name: 'Taco',
  type: 'svg',
  x: 40,
  y: 60,
  width: 300,
  height: 150,
  rotation: 12,
  opacity: 0.8,
  blendMode: 'multiply',
  visible: true,
  locked: false,
  animations: [{ id: 'a', preset: 'fade', phase: 'in', enabled: true, easing: 'easeOut', params: {}, delay: 0, duration: 1 }],
  viewBox: { x: 5, y: 5, width: 100, height: 50 },
  paths: [path('p1', '#ff0000'), path('p2', '#00ff00', '#ff0000')],
  sourceSvg: '<svg/>',
}

const asset = (version: number, motions: string[] = []): PuppetAsset =>
  normalizeAsset({
    ...assetFromLayer(svgLayer, 'A1', '2026-01-01T00:00:00.000Z'),
    version,
    motions: motions.map((id) => ({ id, name: id, animations: {} })),
  })

const docWith = (...layers: PosterDoc['layers']): PosterDoc => ({
  id: 'D',
  name: 'D',
  schemaVersion: 1,
  createdAt: '',
  updatedAt: '',
  artboard: { width: 1000, height: 1000, background: '#000' },
  timeline: { durationSec: 4, fps: 30, loop: true },
  layers,
})

describe('assetFromLayer + instanceFromLayer', () => {
  it('an SVG layer and its instance draw identical geometry', () => {
    const inst = instanceFromLayer(svgLayer, asset(1))
    expect(getLayerPaths(inst)).toEqual(getLayerPaths(svgLayer))
  })

  it('a shape layer freezes its generated geometry exactly', () => {
    const shape: ShapeLayer = {
      ...svgLayer,
      type: 'shape',
      shape: 'star',
      params: { points: 5, inner: 45 },
      fill: '#ffcc00',
      stroke: '#000000',
      strokeWidth: 6,
    } as unknown as ShapeLayer
    const a = assetFromLayer(shape, 'S', '')
    const inst = instanceFromLayer(shape, a)
    expect(getLayerPaths(inst)).toEqual(getLayerPaths(shape))
  })

  it('keeps the layer’s own properties and id', () => {
    const inst = instanceFromLayer(svgLayer, asset(1))
    expect(inst).toMatchObject({
      id: 'L1',
      name: 'Taco',
      x: 40,
      y: 60,
      width: 300,
      height: 150,
      rotation: 12,
      opacity: 0.8,
      blendMode: 'multiply',
      animations: svgLayer.animations,
      type: 'puppet',
      assetId: 'A1',
    })
    expect(inst).not.toHaveProperty('paths')
  })
})

describe('placeInstance', () => {
  it('uses natural size when it fits, scaled to 80% of the artboard when not', () => {
    const a = asset(1)
    expect(placeInstance(a, { width: 1000, height: 1000, background: '' }, 'x')).toMatchObject({
      width: 300,
      height: 150,
      x: 350,
      y: 425,
    })
    const small = placeInstance(a, { width: 150, height: 1000, background: '' }, 'x')
    expect(small.width).toBe(120)
    expect(small.height).toBe(60)
  })

  it('selects the first motion', () => {
    expect(placeInstance(asset(1, ['m1', 'm2']), { width: 1000, height: 1000, background: '' }, 'x').motionId).toBe('m1')
  })
})

describe('refreshSnapshots', () => {
  const inst = (over: Partial<PuppetLayer> = {}): PuppetLayer => ({ ...instanceFromLayer(svgLayer, asset(1, ['m1'])), motionId: 'm1', ...over })

  it('lists linked assets once, skipping detached ones', () => {
    const doc = docWith(inst(), inst({ id: 'L2' }), inst({ id: 'L3', assetId: 'B', detached: true }))
    expect(linkedAssetIds(doc)).toEqual(['A1'])
  })

  it('returns the same doc when every snapshot is current', () => {
    const doc = docWith(inst())
    expect(refreshSnapshots(doc, new Map([['A1', asset(1, ['m1'])]]))).toBe(doc)
  })

  it('replaces the snapshot when the version differs — older too (studio undo)', () => {
    for (const v of [5, 0]) {
      const next = refreshSnapshots(docWith(inst()), new Map([['A1', asset(v, ['m1'])]]))
      const l = next.layers[0] as PuppetLayer
      expect(l.assetVersion).toBe(v)
      expect(l.snapshot.version).toBe(v)
      expect(l.motionId).toBe('m1')
    }
  })

  it('falls back to still when the chosen motion was deleted', () => {
    const next = refreshSnapshots(docWith(inst()), new Map([['A1', asset(2)]]))
    expect((next.layers[0] as PuppetLayer).motionId).toBeUndefined()
  })

  it('detaches, keeping the snapshot, when the asset is gone', () => {
    const before = inst()
    const next = refreshSnapshots(docWith(before), new Map([['A1', null]]))
    const l = next.layers[0] as PuppetLayer
    expect(l.detached).toBe(true)
    expect(l.snapshot).toBe(before.snapshot)
  })

  it('leaves detached instances alone', () => {
    const doc = docWith(inst({ detached: true }))
    expect(refreshSnapshots(doc, new Map([['A1', asset(9)]]))).toBe(doc)
  })
})

describe('remapSwatches (colour overrides)', () => {
  it('maps several colours at once without cascading', () => {
    const out = remapSwatches(svgLayer.paths, { '#ff0000': '#00ff00', '#00ff00': '#0000ff' })
    expect(out[0].fill).toEqual({ type: 'solid', color: '#00ff00' })
    expect(out[1].fill).toEqual({ type: 'solid', color: '#0000ff' })
    expect(out[1].stroke).toEqual({ type: 'solid', color: '#00ff00' })
  })

  it('keeps alpha and unchanged objects', () => {
    const p = path('a', 'rgba(255, 0, 0, 0.5)')
    const [out] = remapSwatches([p], { '#ff0000': '#123456' })
    expect(out.fill).toEqual({ type: 'solid', color: '#12345680' })
    const same = [path('b', '#abcdef')]
    expect(remapSwatches(same, { '#ff0000': '#000000' })[0]).toBe(same[0])
    expect(remapSwatches(same, {})).toBe(same)
  })

  it('applies to an instance’s rendered paths', () => {
    const inst: PuppetLayer = { ...instanceFromLayer(svgLayer, asset(1)), colorOverrides: { '#ff0000': '#0000ff' } }
    const [p1] = getLayerPaths(inst)
    expect(p1.fill).toEqual({ type: 'solid', color: '#0000ff' })
  })
})
