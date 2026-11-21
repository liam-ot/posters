// Revealing a stroke along its length — including strokes that are already
// dashed or dotted, so a dotted spiral draws in dot by dot (docs/adr/0011).
//
// Canvas dash model (verified in a browser): the dash pattern is a cycle, and the
// point `s` units along the path shows pattern position `s + offset` (SVG
// semantics). A negative offset shifts the pattern *forward*, which lets an
// array that must start with a dash begin with a gap instead.

export interface DashResult {
  /** undefined = solid. */
  dash: number[] | undefined
  offset: number
  /** false = nothing to draw yet. */
  visible: boolean
}

const EPS = 1e-6

export const patternLength = (p: number[]) => p.reduce((a, b) => a + b, 0)

/** Normalise to a usable even-length pattern with a positive period, or undefined for solid. */
export function cleanPattern(p: number[] | undefined): number[] | undefined {
  if (!p || p.length === 0) return undefined
  const even = p.length % 2 ? [...p, ...p] : p
  return patternLength(even) > EPS ? even : undefined
}

/**
 * The dash array (and offset) that shows only the first `reveal` units of a
 * stroke `total` long, drawn with `pattern` shifted by `offset`.
 *
 * - `pop`: a dash appears whole as soon as the reveal reaches its start.
 * - `grow`: the dash being reached is clipped at the reveal point.
 * At full reveal the plain pattern is returned, so the final frame is exactly
 * the resting stroke. Synthesised dashes are never zero-length (with round caps
 * those draw stray dots); only zero-length dashes the pattern itself contains survive.
 */
export function revealDash(
  pattern: number[] | undefined,
  offset: number,
  reveal: number,
  total: number,
  pop: boolean,
): DashResult {
  const pat = cleanPattern(pattern)
  if (reveal >= total - EPS) return { dash: pat, offset: pat ? offset : 0, visible: true }
  if (reveal <= EPS) return { dash: undefined, offset: 0, visible: false }

  // Solid stroke: one dash of the revealed length, then a gap longer than the path.
  if (!pat) return { dash: [reveal, total + 1], offset: 0, visible: true }

  const n = pat.length
  const S = patternLength(pat)
  const phase = ((offset % S) + S) % S

  // Which pattern element the path start falls in, and how much of it remains.
  // A zero-length element sitting exactly at the phase (a dot at the path start) counts as the start.
  let idx = 0
  let acc = 0
  while (idx < n - 1 && !(phase < acc + pat[idx] || (pat[idx] === 0 && acc >= phase))) {
    acc += pat[idx]
    idx++
  }
  let remaining = pat[idx] - (phase - acc)

  const out: number[] = []
  let lead = 0
  let pos = 0
  let first = true
  for (let guard = 0; guard < 1_000_000; guard++) {
    const on = idx % 2 === 0
    const len = first ? remaining : pat[idx]
    first = false

    if (on) {
      if (pos >= reveal - EPS) break
      out.push(pop ? len : Math.min(len, reveal - pos))
    } else if (out.length === 0) {
      lead += len // a gap before the first dash becomes a negative offset
    } else {
      if (pos >= reveal - EPS) break
      out.push(len)
    }
    pos += len
    idx = (idx + 1) % n
    if (pos >= total) break
  }

  if (out.length === 0) return { dash: undefined, offset: 0, visible: false }
  // Must end on a gap that covers the rest of the path, or the cycle would restart.
  if (out.length % 2 === 1) out.push(total + 1)
  else out[out.length - 1] = Math.max(out[out.length - 1], total + 1)
  return { dash: out, offset: -lead, visible: true }
}

/** The stretches [a, b] of a path of length `total` that a dash array draws (canvas semantics). Used by tests. */
export function dashCoverage(
  dash: number[] | undefined,
  offset: number,
  total: number,
): [number, number][] {
  if (!dash) return [[0, total]]
  const pat = dash.length % 2 ? [...dash, ...dash] : dash
  const S = patternLength(pat)
  const out: [number, number][] = []
  // Walk pattern cycles covering [offset, offset + total].
  let cycleStart = Math.floor(offset / S) * S
  for (; cycleStart < offset + total; cycleStart += S) {
    let at = cycleStart
    for (let i = 0; i < pat.length; i++) {
      const a = at
      const b = at + pat[i]
      at = b
      if (i % 2 === 0) {
        const lo = Math.max(a, offset) - offset
        const hi = Math.min(b, offset + total) - offset
        if (hi > lo || (pat[i] === 0 && a >= offset && a <= offset + total)) out.push([lo, hi])
      }
    }
  }
  return out
}
