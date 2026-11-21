import { describe, expect, it } from 'vitest'
import {
  closeGaps,
  contours,
  fillHoles,
  loopsIntersect,
  meshComponents,
  meshFromMask,
  polygonArea,
  simplifyLoop,
  type Mask,
} from './mesh'

/** A w×h mask with `inside(x, y)` true at pixel centres. */
function mask(w: number, h: number, inside: (x: number, y: number) => boolean): Mask {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = inside(x + 0.5, y + 0.5) ? 1 : 0
  return { w, h, data }
}

const square = mask(120, 120, (x, y) => x >= 10 && x < 110 && y >= 10 && y < 110)
const ring = mask(120, 120, (x, y) => {
  const r = Math.hypot(x - 60, y - 60)
  return r < 50 && r > 25
})
// Two vertical bars with a 3 px gap: like a character's legs.
const bars = mask(120, 120, (x, y) => y >= 10 && y < 110 && ((x >= 20 && x < 58) || (x >= 61 && x < 100)))

function triArea([a, b, c]: number[], v: [number, number][]) {
  return Math.abs((v[b][0] - v[a][0]) * (v[c][1] - v[a][1]) - (v[b][1] - v[a][1]) * (v[c][0] - v[a][0])) / 2
}

function inside(m: Mask, x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  return xi >= 0 && yi >= 0 && xi < m.w && yi < m.h && m.data[yi * m.w + xi] === 1
}

describe('mask operations', () => {
  it('fillHoles fills a ring into a disc', () => {
    const filled = fillHoles(ring)
    expect(filled.data[60 * 120 + 60]).toBe(1)
    expect(filled.data[5 * 120 + 5]).toBe(0)
  })

  it('closeGaps bridges a 1 px break but not a 6 px one', () => {
    const broken = (gap: number) =>
      mask(60, 20, (x, y) => y > 5 && y < 15 && (x < 30 || x > 30 + gap))
    expect(closeGaps(broken(1), 2).data[10 * 60 + 30]).toBe(1)
    expect(closeGaps(broken(6), 2).data[10 * 60 + 33]).toBe(0)
  })
})

describe('contours', () => {
  it('traces one loop around a square with the right area', () => {
    const loops = contours(square)
    expect(loops).toHaveLength(1)
    expect(polygonArea(loops[0])).toBeCloseTo(100 * 100, -2)
  })

  it('keeps the two bars as two loops', () => {
    expect(contours(bars)).toHaveLength(2)
  })

  it('simplifying a square leaves (about) its corners, still non-crossing', () => {
    const s = simplifyLoop(contours(square)[0], 1)
    expect(s.length).toBeLessThanOrEqual(8)
    expect(loopsIntersect([s])).toBe(false)
  })
})

describe('meshFromMask', () => {
  it('covers a square with triangles inside it, area ≈ the square', () => {
    const m = meshFromMask(square, { detail: 200 })
    const area = m.tris.reduce((a, t) => a + triArea(t, m.verts), 0)
    expect(area).toBeGreaterThan(100 * 100 * 0.97)
    expect(area).toBeLessThan(100 * 100 * 1.03)
    for (const t of m.tris) {
      const cx = (m.verts[t[0]][0] + m.verts[t[1]][0] + m.verts[t[2]][0]) / 3
      const cy = (m.verts[t[0]][1] + m.verts[t[1]][1] + m.verts[t[2]][1]) / 3
      expect(inside(square, cx, cy)).toBe(true)
    }
  })

  it('fills a ring once holes are filled — one island', () => {
    const m = meshFromMask(fillHoles(ring), { detail: 200 })
    expect(meshComponents(m.tris, m.verts.length)).toHaveLength(1)
  })

  it('never connects two parts 3 px apart, even with coarse triangles', () => {
    for (const detail of [40, 150, 400]) {
      const m = meshFromMask(bars, { detail })
      expect(meshComponents(m.tris, m.verts.length)).toHaveLength(2)
      // No triangle reaches across the gap.
      for (const t of m.tris) {
        const xs = t.map((i) => m.verts[i][0])
        expect(Math.min(...xs) >= 59.5 || Math.max(...xs) <= 58.5).toBe(true)
      }
    }
  })

  it('hits the requested triangle count within ±25%', () => {
    for (const detail of [100, 300, 600]) {
      const n = meshFromMask(square, { detail }).tris.length
      expect(n).toBeGreaterThan(detail * 0.75)
      expect(n).toBeLessThan(detail * 1.25)
    }
  })

  it('has no degenerate triangles and is deterministic', () => {
    const a = meshFromMask(fillHoles(ring), { detail: 250 })
    for (const t of a.tris) expect(triArea(t, a.verts)).toBeGreaterThan(0.01)
    expect(meshFromMask(fillHoles(ring), { detail: 250 })).toEqual(a)
  })

  it('drops specks but keeps real islands', () => {
    const withSpeck = mask(120, 120, (x, y) => (x >= 10 && x < 110 && y >= 10 && y < 100) || (x > 112 && x < 114 && y > 112 && y < 114))
    const m = meshFromMask(withSpeck, { detail: 100 })
    expect(meshComponents(m.tris, m.verts.length)).toHaveLength(1)
  })

  it('returns an empty mesh for an empty mask', () => {
    expect(meshFromMask(mask(10, 10, () => false), { detail: 100 })).toEqual({ verts: [], tris: [] })
  })
})
