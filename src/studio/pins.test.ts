import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { normalizeAsset } from '../puppet/normalize'
import type { PuppetAsset } from '../puppet/types'
import { newPin, removePin, setPose } from './pins'

const base = normalizeAsset({
  id: 'a',
  name: 'A',
  size: { width: 200, height: 100 },
  source: { viewBox: { x: 0, y: 0, width: 200, height: 100 }, paths: [] },
  puppet: {
    detail: 100,
    pins: [
      { id: 'p1', kind: 'pin', at: [10, 10] },
      { id: 'p2', kind: 'pin', at: [90, 10], parent: 'p1' },
    ],
  },
  motions: [{ id: 'm', name: 'Dance', poses: { p1: [0, 0] }, animations: { p1: [] } }],
} as unknown as PuppetAsset)

describe('studio pin helpers', () => {
  it('names new pins by kind and gives starch a radius', () => {
    expect(newPin(base, [5.04, 6.06], 'pin')).toMatchObject({ kind: 'pin', name: 'Pin 3', at: [5, 6.1] })
    expect(newPin(base, [5, 6], 'starch')).toMatchObject({ kind: 'starch', name: 'Starch 1', radius: 15, amount: 0.6 })
  })

  it('sets the base pose, and clears it when posed back onto the placement', () => {
    const posed = produce(base, (d) => setPose(d, 'p1', undefined, [30, 40]))
    expect(posed.puppet.pins[0].pose).toEqual([30, 40])
    const back = produce(posed, (d) => setPose(d, 'p1', undefined, [10, 10]))
    expect(back.puppet.pins[0]).not.toHaveProperty('pose')
  })

  it('poses within a motion without touching the base pose', () => {
    const posed = produce(base, (d) => setPose(d, 'p2', 'm', [100, 50]))
    expect(posed.motions[0].poses).toEqual({ p1: [0, 0], p2: [100, 50] })
    expect(posed.puppet.pins[1]).not.toHaveProperty('pose')
    const cleared = produce(posed, (d) => setPose(d, 'p2', 'm', undefined))
    expect(cleared.motions[0].poses).toEqual({ p1: [0, 0] })
  })

  it('removing a pin removes its references', () => {
    const after = produce(base, (d) => removePin(d, 'p1'))
    expect(after.puppet.pins.map((p) => p.id)).toEqual(['p2'])
    expect(after.puppet.pins[0]).not.toHaveProperty('parent')
    expect(after.motions[0].poses).toEqual({})
    expect(after.motions[0].animations).toEqual({})
  })
})
