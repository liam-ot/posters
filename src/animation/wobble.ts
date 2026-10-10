// Noise-displaced path geometry (docs/adr/0011). Paths are normalised to
// absolute M/L/C/Q/Z, long runs are split so straight edges can bend, every
// point is moved by a smooth field, and the data is re-emitted.
import svgpath from 'svgpath'
import { n } from '../shapes/geometry'

export type Seg =
  | ['M' | 'L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Q', number, number, number, number]
  | ['Z']

/** Absolute M/L/C/Q/Z form of any path data. The implicit closing edge becomes explicit so it can bend too. */
export function normalizePath(d: string): Seg[] {
  const out: Seg[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  try {
    svgpath(d)
      .abs()
      .unarc()
      .unshort()
      .iterate((seg) => {
        const c = seg[0] as string
        const v = seg.slice(1) as number[]
        switch (c) {
          case 'M':
            out.push(['M', v[0], v[1]])
            cx = sx = v[0]
            cy = sy = v[1]
            break
          case 'L':
            out.push(['L', v[0], v[1]])
            ;[cx, cy] = [v[0], v[1]]
            break
          case 'H':
            out.push(['L', v[0], cy])
            cx = v[0]
            break
          case 'V':
            out.push(['L', cx, v[0]])
            cy = v[0]
            break
          case 'C':
            out.push(['C', v[0], v[1], v[2], v[3], v[4], v[5]])
            ;[cx, cy] = [v[4], v[5]]
            break
          case 'Q':
            out.push(['Q', v[0], v[1], v[2], v[3]])
            ;[cx, cy] = [v[2], v[3]]
            break
          case 'Z':
          case 'z':
            if (Math.hypot(cx - sx, cy - sy) > 1e-9) out.push(['L', sx, sy])
            out.push(['Z'])
            ;[cx, cy] = [sx, sy]
            break
        }
      })
  } catch {
    return []
  }
  return out
}

const MAX_PIECES = 64

type P = [number, number]
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const dist = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Split one cubic into `k` pieces of equal parameter length (de Casteljau). */
function splitCubic(p0: P, p1: P, p2: P, p3: P, k: number): Seg[] {
  const out: Seg[] = []
  let a = p0
  let b = p1
  let c = p2
  const d = p3
  for (let j = 0; j < k - 1; j++) {
    const t = 1 / (k - j) // split off the first of the remaining k-j pieces
    const ab = lerp(a, b, t)
    const bc = lerp(b, c, t)
    const cd = lerp(c, d, t)
    const abc = lerp(ab, bc, t)
    const bcd = lerp(bc, cd, t)
    const m = lerp(abc, bcd, t)
    out.push(['C', ab[0], ab[1], abc[0], abc[1], m[0], m[1]])
    a = m
    b = bcd
    c = cd
  }
  out.push(['C', b[0], b[1], c[0], c[1], d[0], d[1]])
  return out
}

function splitQuad(p0: P, p1: P, p2: P, k: number): Seg[] {
  const out: Seg[] = []
  let a = p0
  let b = p1
  for (let j = 0; j < k - 1; j++) {
    const t = 1 / (k - j)
    const ab = lerp(a, b, t)
    const bc = lerp(b, p2, t)
    const m = lerp(ab, bc, t)
    out.push(['Q', ab[0], ab[1], m[0], m[1]])
    a = m
    b = bc
  }
  out.push(['Q', b[0], b[1], p2[0], p2[1]])
  return out
}

/** Split segments longer than `maxLen` (local units) into pieces, so a long edge has points that can move. */
export function subdivide(segs: Seg[], maxLen: number): Seg[] {
  const out: Seg[] = []
  let cur: P = [0, 0]
  let start: P = [0, 0]
  const pieces = (len: number) => Math.min(MAX_PIECES, Math.max(1, Math.ceil(len / Math.max(1e-6, maxLen))))
  for (const s of segs) {
    switch (s[0]) {
      case 'M':
        out.push(s)
        cur = start = [s[1], s[2]]
        break
      case 'L': {
        const to: P = [s[1], s[2]]
        const k = pieces(dist(cur, to))
        for (let j = 1; j <= k; j++) {
          const q = lerp(cur, to, j / k)
          out.push(['L', q[0], q[1]])
        }
        cur = to
        break
      }
      case 'C': {
        const p1: P = [s[1], s[2]]
        const p2: P = [s[3], s[4]]
        const to: P = [s[5], s[6]]
        const k = pieces(dist(cur, p1) + dist(p1, p2) + dist(p2, to))
        out.push(...(k > 1 ? splitCubic(cur, p1, p2, to, k) : [s]))
        cur = to
        break
      }
      case 'Q': {
        const p1: P = [s[1], s[2]]
        const to: P = [s[3], s[4]]
        const k = pieces(dist(cur, p1) + dist(p1, to))
        out.push(...(k > 1 ? splitQuad(cur, p1, to, k) : [s]))
        cur = to
        break
      }
      case 'Z':
        out.push(s)
        cur = start
        break
    }
  }
  return out
}

/** Move every point of `segs` by `displace(x, y)` and write path data. Control points move too, which keeps curves smooth. */
export function displaceSegments(segs: Seg[], displace: (x: number, y: number) => P): string {
  let d = ''
  const pt = (x: number, y: number) => {
    const [dx, dy] = displace(x, y)
    return `${n(x + dx)} ${n(y + dy)}`
  }
  for (const s of segs) {
    switch (s[0]) {
      case 'M':
      case 'L':
        d += `${s[0]}${pt(s[1], s[2])}`
        break
      case 'C':
        d += `C${pt(s[1], s[2])} ${pt(s[3], s[4])} ${pt(s[5], s[6])}`
        break
      case 'Q':
        d += `Q${pt(s[1], s[2])} ${pt(s[3], s[4])}`
        break
      case 'Z':
        d += 'Z'
        break
    }
  }
  return d
}

const cache = new Map<string, Seg[]>()
const CACHE_MAX = 500

/** Normalised + subdivided segments, cached per (path data, spacing). */
export function preparedSegments(d: string, maxLen: number): Seg[] {
  const key = `${d}|${maxLen.toFixed(3)}`
  const hit = cache.get(key)
  if (hit) return hit
  const out = subdivide(normalizePath(d), maxLen)
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
  cache.set(key, out)
  return out
}
