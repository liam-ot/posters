import { describe, expect, it } from 'vitest'
import type { VectorPath } from '../types/poster'
import { replaceSwatch } from '../svg/palette'
import { meshKey } from './build'
import { normalizeAsset } from './normalize'
import type { PuppetAsset } from './types'

const path: VectorPath = {
  id: 'p',
  d: 'M0 0L50 0L50 50Z',
  transform: [1, 0, 0, 1, 0, 0],
  fill: { type: 'solid', color: '#000000' },
  stroke: null,
  strokeWidth: 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 4,
  fillRule: 'nonzero',
  opacity: 1,
  visible: true,
}
const asset = normalizeAsset({
  id: 'a',
  name: 'A',
  size: { width: 50, height: 50 },
  source: { viewBox: { x: 0, y: 0, width: 50, height: 50 }, paths: [path] },
} as unknown as PuppetAsset)
const withPaths = (paths: VectorPath[]): PuppetAsset => ({ ...asset, source: { ...asset.source, paths } })

describe('meshKey', () => {
  it('ignores colour changes (the silhouette is the same)', () => {
    expect(meshKey(withPaths(replaceSwatch([path], '#000000', '#ff0000')))).toBe(meshKey(asset))
  })

  it('changes with geometry, visibility, stroke width and detail', () => {
    const k = meshKey(asset)
    expect(meshKey(withPaths([{ ...path, d: 'M0 0L40 0L40 50Z' }]))).not.toBe(k)
    expect(meshKey(withPaths([{ ...path, visible: false }]))).not.toBe(k)
    expect(meshKey(withPaths([{ ...path, stroke: { type: 'solid', color: '#000' }, strokeWidth: 4 }]))).not.toBe(k)
    expect(meshKey({ ...asset, puppet: { ...asset.puppet, detail: 400 } })).not.toBe(k)
  })
})
