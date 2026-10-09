import { describe, expect, it } from 'vitest'
import type {
  EllipseLayer,
  ImageLayer,
  RectLayer,
  TextLayer,
} from '../types/poster'
import {
  borderConfig,
  ellipseConfig,
  fontStyleString,
  layerBorder,
  layerGroupConfig,
  rectConfig,
  textConfig,
} from './configs'

const base = {
  id: 'a',
  name: 'n',
  x: 10,
  y: 20,
  width: 200,
  height: 100,
  rotation: 15,
  opacity: 0.5,
  visible: true,
  locked: false,
}

const rect: RectLayer = { ...base, type: 'rect', fill: '#f00', cornerRadius: 8 }
const ellipse: EllipseLayer = { ...base, type: 'ellipse', fill: '#0f0' }
const text: TextLayer = {
  ...base,
  type: 'text',
  text: 'Hi',
  fontFamily: 'Inter',
  fontSize: 40,
  fontWeight: 700,
  fontStyle: 'italic',
  fill: '#fff',
  align: 'center',
  lineHeight: 1.1,
  letterSpacing: 2,
}

describe('fontStyleString', () => {
  it('prefixes italic only when italic', () => {
    expect(fontStyleString(400, false)).toBe('400')
    expect(fontStyleString('bold', true)).toBe('italic bold')
  })
})

describe('layerGroupConfig', () => {
  it('maps transform, opacity and blend mode', () => {
    expect(layerGroupConfig({ ...rect, blendMode: 'multiply' })).toEqual({
      x: 10,
      y: 20,
      rotation: 15,
      opacity: 0.5,
      globalCompositeOperation: 'multiply',
    })
  })

  it('zeroes opacity for hidden layers', () => {
    expect(layerGroupConfig({ ...rect, visible: false }).opacity).toBe(0)
  })
})

describe('shape configs', () => {
  it('rect uses the layer box and clears dash when solid', () => {
    const c = rectConfig({ ...rect, stroke: '#000', strokeWidth: 4 })
    expect(c).toMatchObject({
      width: 200,
      height: 100,
      fill: '#f00',
      cornerRadius: 8,
      stroke: '#000',
      strokeWidth: 4,
      dash: undefined,
      lineCap: 'butt',
    })
  })

  it('rect applies a dashed style scaled by stroke width', () => {
    const c = rectConfig({
      ...rect,
      stroke: '#000',
      strokeWidth: 2,
      strokeStyle: 'dashed',
    })
    expect(c.dash).toEqual([6, 4])
  })

  it('ellipse is centred in its box', () => {
    expect(ellipseConfig(ellipse)).toMatchObject({
      x: 100,
      y: 50,
      radiusX: 100,
      radiusY: 50,
    })
  })

  it('text maps the style fields and wraps by word', () => {
    expect(textConfig(text)).toMatchObject({
      width: 200,
      text: 'Hi',
      fontStyle: 'italic 700',
      align: 'center',
      wrap: 'word',
    })
  })
})

describe('borders', () => {
  it('insets the border by half the stroke width', () => {
    expect(borderConfig(100, 50, '#000', 10)).toMatchObject({
      x: 5,
      y: 5,
      width: 90,
      height: 40,
    })
  })

  it('never produces a negative size', () => {
    const c = borderConfig(4, 4, '#000', 10)
    expect(c.width).toBe(0)
    expect(c.height).toBe(0)
  })

  it('layerBorder is null without a stroke colour or width', () => {
    const img: ImageLayer = { ...base, type: 'image', src: '' }
    expect(layerBorder(img)).toBeNull()
    expect(layerBorder({ ...img, stroke: '#000' })).toBeNull()
    expect(layerBorder({ ...img, strokeWidth: 3 })).toBeNull()
    expect(layerBorder({ ...img, stroke: '#000', strokeWidth: 3 })).toEqual({
      stroke: '#000',
      strokeWidth: 3,
      strokeStyle: undefined,
    })
  })
})
