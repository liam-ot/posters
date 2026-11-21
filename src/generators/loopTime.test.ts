import { describe, expect, it } from 'vitest'
import { crossfadeDrift, loopClock, loopCycles, loopPhase } from './loopTime'

const rates = { drift: 0.5, evolve: 1 }

describe('loop-safe time', () => {
  it('phase wraps at the loop length', () => {
    expect(loopPhase(0, 4)).toBe(0)
    expect(loopPhase(1, 4)).toBeCloseTo(0.25)
    expect(loopPhase(4, 4)).toBe(0)
    expect(loopPhase(5, 4)).toBeCloseTo(0.25)
    expect(loopPhase(3, 0)).toBe(0)
  })

  it('drift completes whole cycles, at least one when moving', () => {
    expect(loopCycles(0, 8, 0.5)).toBe(0)
    expect(loopCycles(0.01, 8, 0.5)).toBe(1)
    expect(loopCycles(1, 8, 0.5)).toBe(4)
    expect(loopCycles(0.3, 10, 0.5)).toBe(2) // 1.5 rounds to 2
  })

  it('the last frame equals the first', () => {
    for (const speed of [0.1, 0.2, 0.57, 1]) {
      for (const loopSec of [2, 4, 7.5, 12]) {
        const a = loopClock(0, loopSec, speed, rates)
        const b = loopClock(loopSec, loopSec, speed, rates)
        // Drift may differ by whole tiles; the tileable field makes that invisible.
        expect(Number.isInteger(Math.round(b.drift - a.drift))).toBe(true)
        expect(b.evo[0]).toBeCloseTo(a.evo[0], 9)
        expect(b.evo[1]).toBeCloseTo(a.evo[1], 9)
        // Just before the loop point, drift approaches a whole number of tiles.
        const end = loopClock(loopSec - 1e-6, loopSec, speed, rates).drift
        expect(Math.abs(end - Math.round(end))).toBeLessThan(1e-3)
      }
    }
  })

  it('starts from the same point at any speed', () => {
    for (const speed of [0, 0.1, 1]) expect(loopClock(0, 5, speed, rates).evo).toEqual([0, 0])
  })

  it('speed 0 is frozen', () => {
    const a = loopClock(0, 6, 0, rates)
    const b = loopClock(2.3, 6, 0, rates)
    expect(b.drift).toBe(0)
    expect(b.evo).toEqual(a.evo)
  })

  it('evolution speed does not depend on the loop length', () => {
    // Distance travelled in noise space per second is the same for a 4 s and a 16 s loop.
    const step = (loopSec: number) => {
      const a = loopClock(0, loopSec, 0.5, rates).evo
      const b = loopClock(0.01, loopSec, 0.5, rates).evo
      return Math.hypot(b[0] - a[0], b[1] - a[1])
    }
    expect(step(16)).toBeCloseTo(step(4), 4)
  })
})

describe('crossfade drift', () => {
  const vel: [number, number] = [-0.2, 0.08]

  it('loops exactly and is still at speed 0', () => {
    for (const loopSec of [3, 5, 12.5]) {
      const a = crossfadeDrift(0, loopSec, 0.6, vel, 0.3)
      const b = crossfadeDrift(loopSec, loopSec, 0.6, vel, 0.3)
      expect(b).toEqual(a)
    }
    expect(crossfadeDrift(1.7, 5, 0, vel, 0.3)).toEqual({ offA: [0, 0], offB: [0, 0], wA: 1 })
  })

  it('a copy only jumps while it is invisible', () => {
    const loopSec = 6
    let prev = crossfadeDrift(0, loopSec, 1, vel, 0.3)
    for (let t = 0.001; t <= loopSec; t += 0.001) {
      const cur = crossfadeDrift(t, loopSec, 1, vel, 0.3)
      if (Math.abs(cur.offA[0] - prev.offA[0]) > 0.01) expect(Math.min(cur.wA, prev.wA)).toBeLessThan(1e-3)
      if (Math.abs(cur.offB[0] - prev.offB[0]) > 0.01) expect(Math.min(1 - cur.wA, 1 - prev.wA)).toBeLessThan(1e-3)
      prev = cur
    }
  })

  it('drifts at the real velocity, whatever the loop length', () => {
    // Between hand-overs, the visible copy moves at velocity × speed.
    const a = crossfadeDrift(1.0, 4, 0.5, vel, 0.3)
    const b = crossfadeDrift(1.01, 4, 0.5, vel, 0.3)
    expect((b.offA[0] - a.offA[0]) / 0.01).toBeCloseTo(-0.1, 6)
  })
})
