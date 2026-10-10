import { describe, expect, it } from 'vitest'
import { SHAPE_LIST, SHAPES, defaultShapeParams, generateShape } from './library'
import type { ShapeParams } from './library'

/** Control-point hull of absolute M/L/Q/C/Z path data — a conservative bound. */
function hull(d: string) {
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  const nums: number[] = []
  let i = 0
  const cmds: string[] = []
  while (i < tokens.length) {
    const t = tokens[i++]
    if (/[MLQCZ]/.test(t)) {
      cmds.push(t)
      continue
    }
    nums.push(Number(t))
  }
  const expected = cmds.reduce((n, c) => n + ({ M: 2, L: 2, Q: 4, C: 6, Z: 0 } as Record<string, number>)[c], 0)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let k = 0; k < nums.length; k += 2) {
    minX = Math.min(minX, nums[k]); maxX = Math.max(maxX, nums[k])
    minY = Math.min(minY, nums[k + 1]); maxY = Math.max(maxY, nums[k + 1])
  }
  return { minX, minY, maxX, maxY, count: nums.length, expected, cmds, finite: nums.every(Number.isFinite) }
}

const SIZES: [number, number][] = [[300, 300], [480, 120], [100, 400], [40, 40]]

/** Defaults plus every slider pushed to its min and to its max. */
function paramVariants(kind: keyof typeof SHAPES): ShapeParams[] {
  const def = SHAPES[kind]
  const out: ShapeParams[] = [{ ...def.defaults }]
  for (const c of def.controls) {
    if (c.type === 'slider') {
      out.push({ ...def.defaults, [c.key]: c.min }, { ...def.defaults, [c.key]: c.max })
    } else if (c.type === 'toggle') {
      out.push({ ...def.defaults, [c.key]: false }, { ...def.defaults, [c.key]: true })
    }
  }
  return out
}

describe('shape library', () => {
  it('has all 12 planned shapes, each with a default for every control', () => {
    expect(SHAPE_LIST).toHaveLength(12)
    for (const d of SHAPE_LIST) for (const c of d.controls) expect(d.defaults).toHaveProperty(c.key)
  })

  for (const def of SHAPE_LIST) {
    describe(def.kind, () => {
      it('produces valid, finite path data that fits its box at every size and slider extreme', () => {
        for (const [w, h] of SIZES) {
          for (const params of paramVariants(def.kind)) {
            const geoms = generateShape(def.kind, params, w, h)
            expect(geoms.length).toBeGreaterThan(0)
            for (const g of geoms) {
              const b = hull(g.d)
              expect(b.finite, `${def.kind} ${w}x${h} ${JSON.stringify(params)}`).toBe(true)
              expect(b.count).toBe(b.expected) // every command has all its numbers
              expect(b.cmds[0]).toBe('M')
              const tol = 0.5
              expect(b.minX).toBeGreaterThanOrEqual(-tol)
              expect(b.minY).toBeGreaterThanOrEqual(-tol)
              expect(b.maxX).toBeLessThanOrEqual(w + tol)
              expect(b.maxY).toBeLessThanOrEqual(h + tol)
            }
          }
        }
      })

      it('is deterministic', () => {
        const a = generateShape(def.kind, defaultShapeParams(def.kind), 300, 200)
        const b = generateShape(def.kind, { ...defaultShapeParams(def.kind) }, 300, 200)
        expect(b).toEqual(a)
      })

      it('closed shapes are closed paths; line shapes are open', () => {
        const d = generateShape(def.kind, defaultShapeParams(def.kind), 300, 200)[0].d
        expect(d.endsWith('Z')).toBe(!def.line)
      })
    })
  }

  it('ring is two even-odd subpaths (a hole)', () => {
    const [g] = generateShape('ring', defaultShapeParams('ring'), 300, 300)
    expect(g.fillRule).toBe('evenodd')
    expect(g.d.match(/M/g)).toHaveLength(2)
  })

  it('star has 2×points vertices and burst changes with its seed', () => {
    const star = generateShape('star', { points: 7 }, 300, 300)[0].d
    expect(star.match(/[ML]/g)).toHaveLength(14)
    const a = generateShape('burst', { seed: 1 }, 300, 300)[0].d
    const b = generateShape('burst', { seed: 2 }, 300, 300)[0].d
    expect(a).not.toBe(b)
  })

  it('polygon rounding adds curves only when asked', () => {
    expect(generateShape('polygon', { sides: 5, rounding: 0 }, 200, 200)[0].d).not.toContain('Q')
    expect(generateShape('polygon', { sides: 5, rounding: 60 }, 200, 200)[0].d).toContain('Q')
  })

  it('squiggle smoothness 0 degenerates to straight-handled segments', () => {
    const d = generateShape('squiggle', { waves: 2, smoothness: 0 }, 400, 100)[0].d
    expect(d.match(/C/g)).toHaveLength(4)
  })

  it('geometry scales to the box rather than being transformed (true-pixel strokes)', () => {
    const small = hull(generateShape('arrow', {}, 100, 50)[0].d)
    const big = hull(generateShape('arrow', {}, 200, 100)[0].d)
    expect(big.maxX).toBeCloseTo(small.maxX * 2, 3)
  })
})
