import { describe, expect, it } from 'vitest'
import type { Paint, VectorPath } from '../types/poster'
import { formatColor, parseColor, replaceRgb, rgbHex, withAlpha } from './color'
import { collectSwatches, remapSwatches, replaceSwatch } from './palette'
import { isSafeHref, sanitizeCss } from './sanitize'
import { circlePath, linePath, parseDashArray, polyPath, rectPath } from './shapes'
import { formatNotes } from './parse'

describe('parseColor / formatColor', () => {
  it.each([
    ['#f00', { r: 255, g: 0, b: 0, a: 1 }],
    ['#FF8800', { r: 255, g: 136, b: 0, a: 1 }],
    ['#ff880080', { r: 255, g: 136, b: 0, a: 128 / 255 }],
    ['#f008', { r: 255, g: 0, b: 0, a: 136 / 255 }],
    ['rgb(1, 2, 3)', { r: 1, g: 2, b: 3, a: 1 }],
    ['rgba(10, 20, 30, 0.5)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['rgb(10 20 30 / 25%)', { r: 10, g: 20, b: 30, a: 0.25 }],
    ['rgb(100%, 0%, 50%)', { r: 255, g: 0, b: 128, a: 1 }],
    ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
  ])('parses %s', (input, expected) => {
    const c = parseColor(input)!
    expect(c.r).toBe(expected.r)
    expect(c.g).toBe(expected.g)
    expect(c.b).toBe(expected.b)
    expect(c.a).toBeCloseTo(expected.a, 6)
  })

  it.each(['', 'red', '#12', '#gggggg', 'rgb(1,2)', 'rgb(a,b,c)', 'hsl(0,0%,0%)'])('rejects %j', (s) => {
    expect(parseColor(s)).toBeNull()
  })

  it('formats opaque colours as #rrggbb and translucent ones as #rrggbbaa', () => {
    expect(formatColor({ r: 255, g: 0, b: 128, a: 1 })).toBe('#ff0080')
    expect(formatColor({ r: 255, g: 0, b: 128, a: 0.5 })).toBe('#ff008080')
  })

  it('round-trips through parse', () => {
    for (const hex of ['#102030', '#a1b2c3d4']) expect(formatColor(parseColor(hex)!)).toBe(hex)
  })

  it('withAlpha multiplies and clamps', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('#ff000080')
    expect(withAlpha('#ff000080', 0.5)).toBe('#ff000040')
    expect(withAlpha('#ff0000', 2)).toBe('#ff0000')
    expect(withAlpha('nonsense', 0.5)).toBe('nonsense')
  })

  it('rgbHex ignores alpha; replaceRgb keeps it', () => {
    expect(rgbHex('#11223380')).toBe('#112233')
    expect(replaceRgb('#11223380', '#ffffff')).toBe('#ffffff80')
    expect(replaceRgb('#112233', '#ff0000')).toBe('#ff0000')
  })
})

describe('svg shapes → path data', () => {
  it('rect: sharp corners use H/V, rounded use arcs', () => {
    expect(rectPath(10, 20, 30, 40)).toBe('M10 20H40V60H10Z')
    const r = rectPath(0, 0, 100, 50, 10)
    expect(r.match(/A/g)).toHaveLength(4)
  })

  it('rect: a missing radius copies the other and both clamp to half the side', () => {
    expect(rectPath(0, 0, 100, 50, 0, 8)).toBe(rectPath(0, 0, 100, 50, 8, 8))
    expect(rectPath(0, 0, 20, 10, 999)).toBe(rectPath(0, 0, 20, 10, 10, 5))
  })

  it('rejects empty shapes', () => {
    expect(rectPath(0, 0, 0, 10)).toBe('')
    expect(circlePath(0, 0, 0)).toBe('')
    expect(polyPath([[0, 0]], false)).toBe('')
  })

  it('line and polylines', () => {
    expect(linePath(1, 2, 3, 4)).toBe('M1 2L3 4')
    expect(polyPath([[0, 0], [10, 0], [10, 10]], true)).toBe('M0 0L10 0L10 10Z')
    expect(polyPath([[0, 0], [10, 0]], false)).toBe('M0 0L10 0')
  })

  it('circle is four cubic curves that start on the right edge', () => {
    const d = circlePath(50, 50, 10)
    expect(d.startsWith('M60 50')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(4)
  })
})

describe('parseDashArray', () => {
  it('handles none, units, separators and odd lengths', () => {
    expect(parseDashArray('none')).toBeUndefined()
    expect(parseDashArray('')).toBeUndefined()
    expect(parseDashArray('4px, 2px')).toEqual([4, 2])
    expect(parseDashArray('4 2 1')).toEqual([4, 2, 1, 4, 2, 1])
    expect(parseDashArray('0, 0')).toBeUndefined()
    expect(parseDashArray('-1, 2')).toBeUndefined()
    expect(parseDashArray('a, b')).toBeUndefined()
  })
})

const solid = (color: string): Paint => ({ type: 'solid', color })
const path = (over: Partial<VectorPath>): VectorPath => ({
  id: 'p',
  d: 'M0 0',
  transform: [1, 0, 0, 1, 0, 0],
  fill: null,
  stroke: null,
  strokeWidth: 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 4,
  fillRule: 'nonzero',
  opacity: 1,
  visible: true,
  ...over,
})

describe('palette', () => {
  const paths = [
    path({ fill: solid('#ff0000'), stroke: solid('#000000') }),
    path({ fill: solid('#ff0000') }),
    path({ fill: solid('#ff000080') }), // same colour, different alpha → same swatch
    path({
      fill: {
        type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0,
        stops: [{ offset: 0, color: '#00ff00' }, { offset: 1, color: '#ff0000' }],
      },
    }),
  ]

  it('counts unique RGB colours across fills, strokes and gradient stops, most used first', () => {
    expect(collectSwatches(paths)).toEqual([
      // Uses of red differ in opacity (one is 50%), so the swatch shows it solid.
      { hex: '#ff0000', count: 4, alpha: 1 },
      { hex: '#000000', count: 1, alpha: 1 },
      { hex: '#00ff00', count: 1, alpha: 1 },
    ])
  })

  it('a swatch reports the opacity its uses share', () => {
    expect(collectSwatches([path({ fill: solid('#11223380') }), path({ fill: solid('#11223380') })])).toEqual([
      { hex: '#112233', count: 2, alpha: 128 / 255 },
    ])
  })

  it('replaceSwatch with an opacity sets it on every use', () => {
    const out = replaceSwatch(paths, '#ff0000', '#0000ff', 0)
    expect(out[0].fill).toEqual(solid('#0000ff00'))
    expect(out[2].fill).toEqual(solid('#0000ff00'))
    expect((out[3].fill as Extract<Paint, { type: 'linear' }>).stops[1].color).toBe('#0000ff00')
  })

  it('overrides: #rrggbbaa sets opacity, #rrggbb keeps each paint’s own', () => {
    const half = remapSwatches(paths, { '#ff0000': '#0000ff' })
    expect(half[2].fill).toEqual(solid('#0000ff80'))
    const clear = remapSwatches(paths, { '#ff0000': '#0000ff00' })
    expect(clear[0].fill).toEqual(solid('#0000ff00'))
    const solidAgain = remapSwatches(paths, { '#ff0000': '#0000ffff' })
    expect(solidAgain[2].fill).toEqual(solid('#0000ff'))
  })

  it('replaceSwatch recolours every use and keeps each paint’s alpha', () => {
    const out = replaceSwatch(paths, '#ff0000', '#0000ff')
    expect(out[0].fill).toEqual(solid('#0000ff'))
    expect(out[0].stroke).toEqual(solid('#000000')) // untouched
    expect(out[2].fill).toEqual(solid('#0000ff80'))
    expect((out[3].fill as Extract<Paint, { type: 'linear' }>).stops[1].color).toBe('#0000ff')
    expect(collectSwatches(out).map((s) => s.hex)).not.toContain('#ff0000')
  })

  it('does not mutate its input and shares unchanged paths', () => {
    const before = JSON.stringify(paths)
    const out = replaceSwatch(paths, '#ff0000', '#0000ff')
    expect(JSON.stringify(paths)).toBe(before)
    const untouched = [path({ fill: solid('#123456') })]
    expect(replaceSwatch(untouched, '#ff0000', '#0000ff')[0]).toBe(untouched[0])
    expect(out).not.toBe(paths)
  })
})

describe('sanitiser rules', () => {
  it('allows only same-document hrefs (and small raster data URLs on <image>)', () => {
    expect(isSafeHref('#grad', 'use')).toBe(true)
    expect(isSafeHref('  #grad ', 'use')).toBe(true)
    for (const bad of ['http://evil.test/x.svg#a', 'https://evil.test/a.png', '//evil.test/a', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'x.svg#a']) {
      expect(isSafeHref(bad, 'use')).toBe(false)
      expect(isSafeHref(bad, 'image')).toBe(false)
    }
    expect(isSafeHref('data:image/png;base64,iVBORw0KGgo=', 'image')).toBe(true)
    expect(isSafeHref('data:image/png;base64,iVBORw0KGgo=', 'use')).toBe(false) // only on <image>
    expect(isSafeHref('data:image/svg+xml;base64,PHN2Zz4=', 'image')).toBe(false) // nested SVG can carry script
  })

  it('drops @import and external url() but keeps #fragment references', () => {
    const css = `@import url(http://evil.test/x.css); .a{fill:url(#g)} .b{background:url("https://evil.test/p.png")} .c{x:url( 'x.png' )}`
    const out = sanitizeCss(css)
    expect(out).not.toMatch(/@import/i)
    expect(out).not.toMatch(/evil\.test/)
    expect(out).not.toMatch(/x\.png/)
    expect(out).toContain('url(#g)')
    expect(out).toContain('.a{fill:url(#g)}')
  })

  it('neutralises css expression()', () => {
    expect(sanitizeCss('a{width:expression(alert(1))}')).not.toMatch(/expression/i)
  })
})

describe('formatNotes', () => {
  it('turns counted notes into readable warnings', () => {
    expect(formatNotes(new Map([['filter', 2], ['script', 1], ['gradient approximated', 3]]))).toEqual([
      '2× filter (ignored)',
      '1× script (removed for safety)',
      '3× gradient approximated',
    ])
  })
})
