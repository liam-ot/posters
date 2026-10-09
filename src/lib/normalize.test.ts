import { describe, expect, it } from 'vitest'
import type { PosterDoc } from '../types/poster'
import { DEFAULT_TIMELINE, normalizeDoc } from './normalize'

const doc: PosterDoc = {
  id: 'x',
  name: 'Poster',
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  artboard: { width: 100, height: 100, background: '#000' },
  timeline: { durationSec: 8, fps: 24, loop: false },
  layers: [],
}

describe('normalizeDoc', () => {
  it('leaves a complete doc unchanged', () => {
    expect(normalizeDoc(doc)).toEqual(doc)
  })

  it('fills a missing timeline and layers', () => {
    const old = { ...doc, timeline: undefined, layers: undefined } as unknown
    const out = normalizeDoc(old as PosterDoc)
    expect(out.timeline).toEqual(DEFAULT_TIMELINE)
    expect(out.layers).toEqual([])
  })

  it('keeps saved timeline values over defaults', () => {
    const out = normalizeDoc({ ...doc, timeline: { durationSec: 2 } as never })
    expect(out.timeline).toEqual({ ...DEFAULT_TIMELINE, durationSec: 2 })
  })

  it('is idempotent and preserves unknown fields', () => {
    const extra = { ...doc, futureField: 1 } as PosterDoc
    const once = normalizeDoc(extra)
    expect(normalizeDoc(once)).toEqual(once)
    expect((once as unknown as { futureField: number }).futureField).toBe(1)
  })
})
