// Loop-safe time for shader generators (docs/adr/0004): every value here is the
// same at t = 0 and t = loopSec, so exported videos loop without a jump.

/** Where we are in the loop, 0..1. A zero-length loop never moves. */
export function loopPhase(t: number, loopSec: number): number {
  if (!(loopSec > 0)) return 0
  const p = (t / loopSec) % 1
  return p < 0 ? p + 1 : p
}

/**
 * Whole cycles a periodic motion makes per loop. Drift across a tileable field
 * only returns to its start after a whole number of tiles, so speed is rounded
 * to the nearest cycle (at least one, unless speed is 0 = frozen).
 */
export function loopCycles(speed: number, loopSec: number, rate: number): number {
  if (!(speed > 0) || !(loopSec > 0)) return 0
  return Math.max(1, Math.round(speed * rate * loopSec))
}

// Start the time circle at an irrational angle so noise samples don't land on
// lattice ties (see ADR 0004's Phase 4 update).
const CIRCLE_START = 1.2345

export interface LoopClock {
  phase: number
  /** Tiles drifted so far: `cycles * phase`, a whole number at the loop point. */
  drift: number
  /**
   * A point on a circle in noise space, for evolution. The radius scales with
   * speed and loop length, so the noise changes at the same rate however long the
   * poster is, and speed needs no rounding. It starts at (0, 0) whatever the speed;
   * speed 0 stays there = frozen.
   */
  evo: [number, number]
}

export function loopClock(
  t: number,
  loopSec: number,
  speed: number,
  rates: { drift: number; evolve: number },
): LoopClock {
  const phase = loopPhase(t, loopSec)
  const drift = loopCycles(speed, loopSec, rates.drift) * phase
  const r = speed > 0 && loopSec > 0 ? (speed * rates.evolve * loopSec) / (2 * Math.PI) : 0
  const a = CIRCLE_START + 2 * Math.PI * phase
  // Shifted so every circle passes through the origin at t = 0: the first frame is
  // the same at any speed (Aura always starts from the same blob, as in the plugin).
  if (!(r > 0)) return { phase, drift, evo: [0, 0] }
  return {
    phase,
    drift,
    evo: [r * (Math.cos(a) - Math.cos(CIRCLE_START)), r * (Math.sin(a) - Math.sin(CIRCLE_START))],
  }
}

export interface CrossfadeDrift {
  /** Offsets of the two copies of the field (same units as `velocity`). */
  offA: [number, number]
  offB: [number, number]
  /** Weight of copy A; copy B's is `1 - wA`. Each copy jumps back only at weight 0. */
  wA: number
}

/**
 * Seamless drift at any speed (as flow-mapped water in games): two copies of a
 * field drift continuously and take turns, each resetting while invisible. One
 * hand-over period moves the field about `maxShift`, so slow drift hands over
 * rarely; the period is rounded so whole periods fill the loop exactly.
 * `velocity` is per second at speed 1. Speed 0 (or no loop) shows copy A, still.
 */
export function crossfadeDrift(
  t: number,
  loopSec: number,
  speed: number,
  velocity: [number, number],
  maxShift: number,
): CrossfadeDrift {
  const vx = velocity[0] * speed
  const vy = velocity[1] * speed
  const v = Math.hypot(vx, vy)
  if (!(v > 0) || !(loopSec > 0)) return { offA: [0, 0], offB: [0, 0], wA: 1 }
  const periods = Math.max(1, Math.round((loopSec * v) / maxShift))
  const span = loopSec / periods
  const sA = (loopPhase(t, loopSec) * periods) % 1
  const sB = (sA + 0.5) % 1
  const off = (s: number): [number, number] => [vx * (s - 0.5) * span, vy * (s - 0.5) * span]
  // sin² and cos² of the same angle: smooth, and they always sum to 1.
  return { offA: off(sA), offB: off(sB), wA: Math.sin(Math.PI * sA) ** 2 }
}
