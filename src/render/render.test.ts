import { describe, expect, it } from 'vitest'
import type { Matrix2D, Paint, ShapeLayer } from '../types/poster'
import { IDENTITY, decomposeMatrix, invert, isIdentity, multiply } from './matrix'
import { paintProps } from './paint'
import { getLayerPaths, pathConfig, pathNodeConfigs } from './paths'

const apply = (m: Matrix2D, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Rebuild the matrix Konva would apply for decomposed attrs (translate·rotate·skew·scale). */
function recompose(d: ReturnType<typeof decomposeMatrix>): Matrix2D {
  const r = (d.rotation * Math.PI) / 180
  const rot: Matrix2D = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
  const skew: Matrix2D = [1, 0, d.skewX, 1, 0, 0]
  const scale: Matrix2D = [d.scaleX, 0, 0, d.scaleY, 0, 0]
  const tr: Matrix2D = [1, 0, 0, 1, d.x, d.y]
  return multiply(tr, multiply(rot, multiply(skew, scale)))
}

describe('matrix', () => {
  const cases: [string, Matrix2D][] = [
    ['identity', IDENTITY],
    ['translate', [1, 0, 0, 1, 10, -4]],
    ['scale', [2, 0, 0, 0.5, 0, 0]],
    ['rotate 30°', [Math.cos(0.52), Math.sin(0.52), -Math.sin(0.52), Math.cos(0.52), 5, 5]],
    ['skew + scale', [1.5, 0, 0.4, 0.8, 3, 7]],
    ['rotate + non-uniform scale + skew', [1.2, 0.7, -0.3, 0.9, -2, 11]],
    ['mirror', [-1, 0, 0, 1, 100, 0]],
  ]

  it.each(cases)('decompose → recompose round-trips (%s)', (_name, m) => {
    const back = recompose(decomposeMatrix(m))
    for (let i = 0; i < 6; i++) expect(back[i]).toBeCloseTo(m[i], 9)
  })

  it('multiply applies the right-hand matrix first', () => {
    const t: Matrix2D = [1, 0, 0, 1, 10, 0]
    const s: Matrix2D = [2, 0, 0, 2, 0, 0]
    expect(apply(multiply(t, s), 1, 1)).toEqual([12, 2]) // scale, then translate
  })

  it('invert undoes a matrix', () => {
    const m: Matrix2D = [1.2, 0.7, -0.3, 0.9, -2, 11]
    const [x, y] = apply(multiply(invert(m), m), 3, 4)
    expect(x).toBeCloseTo(3)
    expect(y).toBeCloseTo(4)
    expect(isIdentity(IDENTITY)).toBe(true)
  })
})

describe('paintProps', () => {
  it('maps solid paints to a plain colour', () => {
    expect(paintProps('fill', { type: 'solid', color: '#f00' })).toEqual({ fill: '#f00' })
    expect(paintProps('stroke', { type: 'solid', color: '#0f0' })).toEqual({ stroke: '#0f0' })
    expect(paintProps('fill', null)).toEqual({})
  })

  const stops = [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }]

  it('maps linear gradients to start/end points and flat colour stops', () => {
    const p: Paint = { type: 'linear', x1: 0, y1: 1, x2: 2, y2: 3, stops }
    expect(paintProps('fill', p)).toEqual({
      fillLinearGradientStartPoint: { x: 0, y: 1 },
      fillLinearGradientEndPoint: { x: 2, y: 3 },
      fillLinearGradientColorStops: [0, '#000', 1, '#fff'],
    })
    expect(Object.keys(paintProps('stroke', p))[0]).toBe('strokeLinearGradientStartPoint')
  })

  it('maps radial fills with the focal point as the inner circle', () => {
    const p: Paint = { type: 'radial', cx: 5, cy: 6, r: 7, fx: 1, fy: 2, stops }
    expect(paintProps('fill', p)).toMatchObject({
      fillRadialGradientStartPoint: { x: 1, y: 2 },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndPoint: { x: 5, y: 6 },
      fillRadialGradientEndRadius: 7,
    })
  })

  it('falls back to a solid colour for radial strokes (Konva has none)', () => {
    expect(paintProps('stroke', { type: 'radial', cx: 0, cy: 0, r: 1, fx: 0, fy: 0, stops })).toEqual({
      stroke: '#000',
    })
  })
})

const shape = (over: Partial<ShapeLayer> = {}): ShapeLayer => ({
  id: 's',
  name: 'S',
  type: 'shape',
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  shape: 'star',
  params: {},
  fill: '#f0f',
  stroke: null,
  ...over,
})

describe('getLayerPaths (shape layers)', () => {
  it('has no inset without a stroke', () => {
    const [p] = getLayerPaths(shape())
    expect(p.transform).toEqual([1, 0, 0, 1, 0, 0])
    expect(p.fill).toEqual({ type: 'solid', color: '#f0f' })
    expect(p.stroke).toBeNull()
  })

  it('insets by half the stroke so the stroke stays inside the layer box', () => {
    const [p] = getLayerPaths(shape({ stroke: '#fff', strokeWidth: 10 }))
    expect(p.transform).toEqual([1, 0, 0, 1, 5, 5])
    expect(p.strokeWidth).toBe(10)
  })

  it('ignores strokeWidth when there is no stroke colour', () => {
    const [p] = getLayerPaths(shape({ stroke: null, strokeWidth: 10 }))
    expect(p.strokeWidth).toBe(0)
    expect(p.transform[4]).toBe(0)
  })

  it('uses round caps for line shapes, flat for closed, and honours overrides and dotted', () => {
    const line = getLayerPaths(shape({ shape: 'squiggle', fill: null, stroke: '#fff', strokeWidth: 8 }))[0]
    expect(line.lineCap).toBe('round')
    const closed = getLayerPaths(shape({ stroke: '#fff', strokeWidth: 8 }))[0]
    expect(closed.lineCap).toBe('butt')
    expect(getLayerPaths(shape({ stroke: '#fff', strokeWidth: 8, lineCap: 'square' }))[0].lineCap).toBe('square')
    expect(getLayerPaths(shape({ stroke: '#fff', strokeWidth: 8, strokeStyle: 'dotted' }))[0].lineCap).toBe('round')
  })

  it('regenerates geometry at the layer size instead of scaling it', () => {
    const a = getLayerPaths(shape({ width: 100, height: 100 }))[0].d
    const b = getLayerPaths(shape({ width: 200, height: 200 }))[0].d
    expect(a).not.toBe(b)
  })

  it('builds Konva configs: transform decomposed, dash from style, no stroke when none', () => {
    const [node] = pathNodeConfigs(shape({ stroke: '#fff', strokeWidth: 4, strokeStyle: 'dashed' }))
    expect(node.config).toMatchObject({ x: 2, y: 2, scaleX: 1, scaleY: 1, strokeWidth: 4, stroke: '#fff', fill: '#f0f' })
    expect(node.config.dash).toEqual([12, 8])
    expect(pathConfig(getLayerPaths(shape())[0]).strokeWidth).toBe(0)
  })

  it('skips invisible paths', () => {
    expect(pathNodeConfigs(shape())).toHaveLength(1)
  })
})
