import { describe, expect, it } from 'vitest'
import { DEFAULT_MESH_DETAIL, normalizeAsset } from './normalize'
import type { PuppetAsset } from './types'

const minimal = {
  id: 'a1',
  name: 'Taco',
  size: { width: 100, height: 50 },
  source: { viewBox: { x: 0, y: 0, width: 100, height: 50 } },
} as unknown as PuppetAsset

describe('normalizeAsset', () => {
  it('fills defaults on a sparse asset', () => {
    const a = normalizeAsset(minimal)
    expect(a).toMatchObject({ kind: 'puppet', schemaVersion: 1, version: 1, motions: [] })
    expect(a.source.paths).toEqual([])
    expect(a.puppet).toEqual({ detail: DEFAULT_MESH_DETAIL, pins: [] })
  })

  it('keeps existing values and unknown fields', () => {
    const full = {
      ...normalizeAsset(minimal),
      version: 7,
      puppet: { detail: 120, pins: [{ id: 'p', kind: 'pin', at: [1, 2] }] },
      motions: [{ id: 'm', name: 'Dance', animations: { p: [] } }],
      future: 'kept',
    } as PuppetAsset
    const a = normalizeAsset(full)
    expect(a.version).toBe(7)
    expect(a.puppet.detail).toBe(120)
    expect(a.puppet.pins).toHaveLength(1)
    expect((a as unknown as { future: string }).future).toBe('kept')
  })

  it('is idempotent', () => {
    const once = normalizeAsset(minimal)
    expect(normalizeAsset(once)).toEqual(once)
  })

  it('gives motions an animations map', () => {
    const a = normalizeAsset({ ...minimal, motions: [{ id: 'm', name: 'Idle' }] } as unknown as PuppetAsset)
    expect(a.motions[0].animations).toEqual({})
  })
})
