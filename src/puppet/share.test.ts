import { describe, expect, it } from 'vitest'
import type { PosterDoc, SvgLayer } from '../types/poster'
import { normalizeDoc } from '../lib/normalize'
import { contextFor } from '../animation/timing'
import { getLayerPaths } from '../render/paths'
import { useEditor } from '../store/editor'
import { assetFromLayer, instanceFromLayer } from './convert'
import { normalizeAsset } from './normalize'
import { delaySeconds, evaluatePins, instancePins } from './pins'
import { dehydrateCharacters, hydrateCharacters } from './share'
import type { PuppetAsset, PuppetLayer } from './types'

const svg: SvgLayer = {
  id: 'S',
  name: 'Taco',
  type: 'svg',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  viewBox: { x: 0, y: 0, width: 200, height: 100 },
  paths: [
    {
      id: 'p',
      d: 'M10 10L50 10L50 40Z',
      transform: [1, 0, 0, 1, 0, 0],
      fill: { type: 'solid', color: '#000' },
      stroke: null,
      strokeWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 4,
      fillRule: 'nonzero',
      opacity: 1,
      visible: true,
    },
  ],
  sourceSvg: '<svg/>',
}
const asset = normalizeAsset(assetFromLayer(svg, 'A', ''))
const copy = (id: string, extra: Partial<PuppetLayer> = {}): PuppetLayer => ({ ...instanceFromLayer(svg, asset), id, ...extra })

const doc = (layers: PosterDoc['layers'], characters?: PosterDoc['characters']): PosterDoc => ({
  id: 'D',
  name: 'D',
  schemaVersion: 1,
  createdAt: '',
  updatedAt: '',
  artboard: { width: 1000, height: 1000, background: '#000' },
  timeline: { durationSec: 4, fps: 30, loop: true, bpm: 120 },
  layers,
  ...(characters ? { characters } : {}),
})

describe('shared character snapshots', () => {
  it('saves one snapshot per character, and copies as references', () => {
    const saved = dehydrateCharacters(doc([copy('a'), copy('b'), copy('c', { detached: true })]))
    expect(Object.keys(saved.characters!)).toEqual(['A'])
    expect(saved.layers[0]).not.toHaveProperty('snapshot')
    expect(saved.layers[1]).not.toHaveProperty('snapshot')
    // A detached copy keeps its own.
    expect(saved.layers[2]).toHaveProperty('snapshot')
  })

  it('loads every linked copy onto the same object', () => {
    const loaded = normalizeDoc(JSON.parse(JSON.stringify(dehydrateCharacters(doc([copy('a'), copy('b')])))))
    const [a, b] = loaded.layers as PuppetLayer[]
    expect(a.snapshot).toBe(b.snapshot)
    expect(a.snapshot.name).toBe('Taco')
    expect(loaded).not.toHaveProperty('characters')
  })

  it('folds old posters (a snapshot per layer) into one shared snapshot', () => {
    const old = JSON.parse(JSON.stringify(doc([copy('a'), copy('b')])))
    const loaded = normalizeDoc(old)
    const [a, b] = loaded.layers as PuppetLayer[]
    expect(a.snapshot).toBe(b.snapshot)
  })

  it('round-trips: save → load → save gives the same file', () => {
    const once = dehydrateCharacters(normalizeDoc(JSON.parse(JSON.stringify(dehydrateCharacters(doc([copy('a'), copy('b')]))))))
    const twice = dehydrateCharacters(normalizeDoc(JSON.parse(JSON.stringify(once))))
    expect(JSON.parse(JSON.stringify(twice))).toEqual(JSON.parse(JSON.stringify(once)))
  })

  it('keeps stored snapshots when saving a doc that came straight from disk (gallery Duplicate)', () => {
    const fromDisk = JSON.parse(JSON.stringify(dehydrateCharacters(doc([copy('a')]))))
    const resaved = dehydrateCharacters(fromDisk)
    expect(resaved.characters!.A.name).toBe('Taco')
  })

  it('a reference with no snapshot draws nothing instead of crashing', () => {
    const broken = hydrateCharacters(JSON.parse(JSON.stringify(dehydrateCharacters(doc([copy('a')])))) as PosterDoc & { characters: undefined })
    const fixed = hydrateCharacters({ ...broken, layers: broken.layers.map((l) => ({ ...l, snapshot: undefined })) as never })
    const l = fixed.layers[0] as PuppetLayer
    expect(l.snapshot.source.paths).toEqual([])
    expect(l.snapshot.version).toBe(0) // the library refresh will replace it
  })
})

describe('duplicating', () => {
  it('⌘D and Alt-drag share the snapshot; Alt-drag leaves the copy in place below', () => {
    const s = useEditor.getState()
    s.loadDoc(doc([copy('a')]))
    s.duplicateLayers(['a'])
    s.duplicateLayers(['a'], { inPlace: true })
    const layers = useEditor.getState().doc!.layers as PuppetLayer[]
    expect(layers).toHaveLength(3)
    expect(new Set(layers.map((l) => l.snapshot)).size).toBe(1)
    const inPlace = layers[0]
    expect([inPlace.x, inPlace.y]).toEqual([0, 0])
    expect(layers[1].id).toBe('a')
    expect(useEditor.getState().selectedIds).toEqual([layers[2].id]) // ⌘D selected its copy; Alt-drag kept it
  })

  it('placing a character relinks existing copies to the same (newest) snapshot', () => {
    const s = useEditor.getState()
    s.loadDoc(doc([copy('a')]))
    const newer: PuppetAsset = { ...asset, version: asset.version + 5 }
    s.placeCharacter(newer)
    const layers = useEditor.getState().doc!.layers as PuppetLayer[]
    expect(layers.map((l) => l.snapshot)).toEqual([newer, newer])
    expect(layers[0].snapshot).toBe(layers[1].snapshot)
  })
})

describe('per-copy delay and mirror', () => {
  const ctx = contextFor({ durationSec: 4, fps: 30, loop: true, bpm: 120 }, false)

  it('delay is in beats at the poster BPM, seconds without one', () => {
    expect(delaySeconds(2, ctx)).toBe(1)
    expect(delaySeconds(2, contextFor({ durationSec: 4, fps: 30, loop: true }, false))).toBe(2)
  })

  it('a delayed copy shows the motion that much later', () => {
    const a: PuppetAsset = {
      ...asset,
      puppet: { ...asset.puppet, pins: [{ id: 'h', kind: 'pin', at: [40, 20] }] },
      motions: [{ id: 'm', name: 'M', poses: { h: [40, 0] }, animations: {}, poseLoop: { enabled: true, shape: 'smooth', period: 2, periodUnit: 'beat' } }],
    }
    const delayed = instancePins({ snapshot: a, motionId: 'm', delay: 1 }, 0.8, ctx)!.get('h')!
    const expected = evaluatePins(a, 'm', 0.3, ctx).get('h')!
    delayed.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9))
  })

  it('mirroring flips the artwork inside the same box', () => {
    const flipped = getLayerPaths(copy('a', { flipX: true }))[0]
    const plain = getLayerPaths(copy('a'))[0]
    // x → width − x: the point at x=10 lands at 190.
    const [a, , c, , e] = flipped.transform
    expect(a * 10 + c * 10 + e).toBeCloseTo(190, 9)
    const [pa, , pc, , pe] = plain.transform
    expect(pa * 10 + pc * 10 + pe).toBeCloseTo(10, 9)
  })
})
