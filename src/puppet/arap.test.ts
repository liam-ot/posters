import { describe, expect, it } from 'vitest'
import { prepareArap, type Handle } from './arap'
import { makeLocator, placeLocated } from './bind'
import { deformPaths, pinPositions } from './deform'
import { meshKey } from './meshKey'
import { normalizeAsset } from './normalize'
import type { PuppetAsset } from './types'

/** A cols×rows grid of quads (two triangles each), spacing 10, offset by (ox, oy). */
function grid(cols: number, rows: number, ox = 0, oy = 0) {
  const verts: number[] = []
  const tris: number[] = []
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) verts.push(ox + x * 10, oy + y * 10)
  const id = (x: number, y: number) => y * (cols + 1) + x
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      tris.push(id(x, y), id(x + 1, y), id(x + 1, y + 1), id(x, y), id(x + 1, y + 1), id(x, y + 1))
    }
  }
  return { verts, tris }
}

function merge(a: { verts: number[]; tris: number[] }, b: { verts: number[]; tris: number[] }) {
  const off = a.verts.length / 2
  return { verts: [...a.verts, ...b.verts], tris: [...a.tris, ...b.tris.map((i) => i + off)] }
}

const bar = grid(10, 2) // 100 × 20, a limb

function handleAt(mesh: { verts: number[]; tris: number[] }, x: number, y: number): Handle {
  const l = makeLocator(mesh.verts, mesh.tris)(x, y)
  return { tri: l.tri, bary: l.bary }
}

const edgeLengthChange = (mesh: { verts: number[]; tris: number[] }, out: Float64Array, inRegion: (x: number, y: number) => boolean) => {
  let sum = 0
  for (let t = 0; t < mesh.tris.length; t += 3) {
    for (let r = 0; r < 3; r++) {
      const i = mesh.tris[t + r]
      const j = mesh.tris[t + ((r + 1) % 3)]
      if (!inRegion(mesh.verts[2 * i], mesh.verts[2 * i + 1])) continue
      const rest = Math.hypot(mesh.verts[2 * i] - mesh.verts[2 * j], mesh.verts[2 * i + 1] - mesh.verts[2 * j + 1])
      const now = Math.hypot(out[2 * i] - out[2 * j], out[2 * i + 1] - out[2 * j + 1])
      sum += Math.abs(now - rest)
    }
  }
  return sum
}

describe('ARAP solver', () => {
  it('returns the rest shape when pins are at rest', () => {
    const pins = [handleAt(bar, 5, 10), handleAt(bar, 95, 10)]
    const out = prepareArap(bar, pins).solve([5, 10, 95, 10])
    out.forEach((v, i) => expect(v).toBeCloseTo(bar.verts[i], 3))
  })

  it('translates the whole mesh when every pin moves by the same vector', () => {
    const pins = [handleAt(bar, 5, 10), handleAt(bar, 95, 10), handleAt(bar, 50, 5)]
    const out = prepareArap(bar, pins).solve([5 + 30, 10 - 12, 95 + 30, 10 - 12, 50 + 30, 5 - 12])
    for (let i = 0; i < out.length; i += 2) {
      expect(out[i]).toBeCloseTo(bar.verts[i] + 30, 2)
      expect(out[i + 1]).toBeCloseTo(bar.verts[i + 1] - 12, 2)
    }
  })

  it('rotates the mesh rigidly when the pins rotate rigidly', () => {
    const at = [[5, 10], [95, 10], [50, 5]]
    const pins = at.map(([x, y]) => handleAt(bar, x, y))
    const a = Math.PI / 6
    const rot = ([x, y]: number[]) => [50 + (x - 50) * Math.cos(a) - (y - 10) * Math.sin(a), 10 + (x - 50) * Math.sin(a) + (y - 10) * Math.cos(a)]
    const out = prepareArap(bar, pins).solve(at.flatMap(rot))
    for (let i = 0; i < out.length; i += 2) {
      const [ex, ey] = rot([bar.verts[i], bar.verts[i + 1]])
      expect(out[i]).toBeCloseTo(ex, 1)
      expect(out[i + 1]).toBeCloseTo(ey, 1)
    }
  })

  it('bends a limb: the moved end follows, the pinned end stays, lengths roughly kept', () => {
    // Pin the left end; lift the right end like an arm raising.
    const pins = [handleAt(bar, 2, 2), handleAt(bar, 2, 18), handleAt(bar, 98, 10)]
    const out = prepareArap(bar, pins).solve([2, 2, 2, 18, 80, -40])
    const vert = (x: number, y: number) => {
      const i = (y / 10) * 11 + x / 10
      return [out[2 * i], out[2 * i + 1]]
    }
    expect(vert(0, 0)[0]).toBeCloseTo(0, 0)
    expect(vert(0, 0)[1]).toBeCloseTo(0, 0)
    expect(vert(100, 10)[1]).toBeLessThan(-25)
    // The bar didn't stretch much: its midline length stays within 15%.
    let len = 0
    for (let x = 0; x < 100; x += 10) {
      const [ax, ay] = vert(x, 10)
      const [bx, by] = vert(x + 10, 10)
      len += Math.hypot(bx - ax, by - ay)
    }
    expect(len).toBeGreaterThan(85)
    expect(len).toBeLessThan(115)
  })

  it('starch resists bending inside its radius', () => {
    const pins = [handleAt(bar, 2, 10), handleAt(bar, 98, 10)]
    const targets = [2, 10, 70, -50]
    const inMiddle = (x: number) => x >= 30 && x <= 70
    const plain = prepareArap(bar, pins).solve(targets)
    const starched = prepareArap(bar, pins, [{ x: 50, y: 10, radius: 30, amount: 1 }]).solve(targets)
    expect(edgeLengthChange(bar, starched, inMiddle)).toBeLessThan(edgeLengthChange(bar, plain, inMiddle) * 0.7)
  })

  it('leaves an island without pins where it is', () => {
    const two = merge(bar, grid(4, 4, 0, 100))
    const pins = [handleAt(two, 5, 10), handleAt(two, 95, 10)]
    const out = prepareArap(two, pins).solve([5, 10, 95, 60])
    for (let i = bar.verts.length; i < two.verts.length; i++) expect(out[i]).toBeCloseTo(two.verts[i], 3)
  })

  it('a single pin drags the whole piece along (no rotation or scale from nowhere)', () => {
    const out = prepareArap(bar, [handleAt(bar, 50, 10)]).solve([70, 30])
    for (let i = 0; i < out.length; i += 2) {
      expect(out[i]).toBeCloseTo(bar.verts[i] + 20, 0)
      expect(out[i + 1]).toBeCloseTo(bar.verts[i + 1] + 20, 0)
    }
  })
})

describe('binding', () => {
  it('round-trips points through the undeformed mesh', () => {
    const locate = makeLocator(bar.verts, bar.tris)
    for (const [x, y] of [[0, 0], [33.3, 7.1], [99.9, 19.9], [57, 12]]) {
      const [px, py] = placeLocated(locate(x, y), bar.tris, bar.verts)
      expect(px).toBeCloseTo(x, 6)
      expect(py).toBeCloseTo(y, 6)
    }
  })

  it('binds points outside the mesh to the nearest triangle', () => {
    const l = makeLocator(bar.verts, bar.tris)(103, 10)
    expect(l.inside).toBe(false)
    const [px] = placeLocated(l, bar.tris, bar.verts)
    expect(px).toBeCloseTo(103, 6)
  })
})

describe('deformPaths', () => {
  const asset = (() => {
    const a = normalizeAsset({
      id: 'a',
      name: 'Bar',
      size: { width: 100, height: 20 },
      source: {
        viewBox: { x: 0, y: 0, width: 100, height: 20 },
        paths: [
          {
            id: 'p',
            d: 'M0 0L100 0L100 20L0 20Z',
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
      },
      puppet: {
        detail: 40,
        pins: [
          { id: 'a', kind: 'pin', at: [5, 10] },
          { id: 'b', kind: 'pin', at: [95, 10] },
        ],
      },
    } as unknown as PuppetAsset)
    a.puppet.mesh = { key: meshKey(a), verts: bar.verts, tris: bar.tris }
    return a
  })()

  it('returns null (original paths, exactly) while no pin has moved', () => {
    expect(deformPaths(asset, pinPositions(asset))).toBeNull()
  })

  it('bends the path data once a pin is posed', () => {
    const posed: PuppetAsset = { ...asset, puppet: { ...asset.puppet, pins: [asset.puppet.pins[0], { ...asset.puppet.pins[1], pose: [90, -20] }] } }
    const [d] = deformPaths(posed, pinPositions(posed))!
    expect(d).not.toBe(asset.source.paths[0].d)
    // The right end went up: some point now has y < -10.
    const ys = d.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1)
    expect(Math.min(...ys)).toBeLessThan(-10)
  })

  it('ignores a stale mesh', () => {
    const stale: PuppetAsset = {
      ...asset,
      puppet: { ...asset.puppet, mesh: { ...asset.puppet.mesh!, key: 'old' }, pins: [asset.puppet.pins[0], { ...asset.puppet.pins[1], pose: [90, -20] }] },
    }
    expect(deformPaths(stale, pinPositions(stale))).toBeNull()
  })

  it('uses a motion pose over the base pose', () => {
    const withMotion: PuppetAsset = {
      ...asset,
      puppet: { ...asset.puppet, pins: [asset.puppet.pins[0], { ...asset.puppet.pins[1], pose: [90, -20] }] },
      motions: [{ id: 'm', name: 'M', poses: { b: [95, 10] }, animations: {} }],
    }
    expect(pinPositions(withMotion, 'm').get('b')).toEqual([95, 10])
    expect(deformPaths(withMotion, pinPositions(withMotion, 'm'))).toBeNull()
  })
})
