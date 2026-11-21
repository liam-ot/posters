import cdt2d from 'cdt2d'
import { mulberry32 } from '../generators/util'

/**
 * Silhouette mask → triangle mesh for puppet deformation (docs/adr/0012).
 * Pure: the browser-only rasterising lives in silhouette.ts. Units here are mask
 * pixels; callers convert to character space.
 *
 * The mesh follows the silhouette's outline exactly (constrained Delaunay), so a
 * gap between two parts — a character's legs — never gets a triangle across it,
 * however coarse the triangles are.
 */

export interface Mask {
  w: number
  h: number
  /** 1 = inside, row-major. */
  data: Uint8Array
}

type P = [number, number]

// ---- Mask operations --------------------------------------------------------

/** Square dilation (r > 0) or erosion (r < 0) with radius |r|, separable. */
function morph(m: Mask, r: number): Mask {
  const grow = r > 0
  const k = Math.abs(r)
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        let v = grow ? 0 : 1
        for (let d = -k; d <= k; d++) {
          const xx = horizontal ? x + d : x
          const yy = horizontal ? y : y + d
          // Outside the mask counts as empty.
          const s = xx < 0 || yy < 0 || xx >= m.w || yy >= m.h ? 0 : src[yy * m.w + xx]
          if (grow ? s : !s) {
            v = grow ? 1 : 0
            break
          }
        }
        out[y * m.w + x] = v
      }
    }
    return out
  }
  return { ...m, data: pass(pass(m.data, true), false) }
}

/** Morphological closing: bridges hairline breaks without growing the shape. */
export function closeGaps(m: Mask, r: number): Mask {
  return r > 0 ? morph(morph(m, r), -r) : m
}

/** Everything not reachable from the border becomes inside (holes are filled). */
export function fillHoles(m: Mask): Mask {
  const { w, h, data } = m
  const outside = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (i: number) => {
    if (!data[i] && !outside[i]) {
      outside[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (i >= w) push(i - w)
    if (i < w * (h - 1)) push(i + w)
  }
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1
  return { w, h, data: out }
}

// ---- Contours ---------------------------------------------------------------

// Marching squares over pixel centres. Edge midpoints are keyed by edge; each
// lies on exactly one contour, so linking by key yields simple closed loops.
// Saddles keep the inside corners apart, which favours separating parts.
const T = 0
const R = 1
const B = 2
const L = 3
const SEGMENTS: number[][][] = [
  [], [[L, B]], [[B, R]], [[L, R]], [[T, R]], [[T, R], [L, B]], [[T, B]], [[T, L]],
  [[T, L]], [[T, B]], [[T, L], [B, R]], [[T, R]], [[L, R]], [[B, R]], [[L, B]], [],
]

/** Closed outline loops of the mask's inside, in pixel coordinates. */
export function contours(m: Mask): P[][] {
  const { w, h, data } = m
  const at = (x: number, y: number) => data[y * w + x]
  // Horizontal edge (x,y)-(x+1,y): 2k; vertical (x,y)-(x,y+1): 2k+1.
  const edgeKey = (cx: number, cy: number, side: number) =>
    side === T ? (cy * w + cx) * 2
      : side === B ? ((cy + 1) * w + cx) * 2
        : side === L ? (cy * w + cx) * 2 + 1
          : (cy * w + cx + 1) * 2 + 1
  const pointOf = (key: number): P => {
    const k = key >> 1
    const x = k % w
    const y = (k - x) / w
    // +0.5: samples are pixel centres.
    return key & 1 ? [x + 0.5, y + 1] : [x + 1, y + 0.5]
  }

  const links = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    links.get(a)?.push(b) ?? links.set(a, [b])
    links.get(b)?.push(a) ?? links.set(b, [a])
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const c = (at(x, y) << 3) | (at(x + 1, y) << 2) | (at(x + 1, y + 1) << 1) | at(x, y + 1)
      for (const [a, b] of SEGMENTS[c]) link(edgeKey(x, y, a), edgeKey(x, y, b))
    }
  }

  const loops: P[][] = []
  const seen = new Set<number>()
  for (const start of links.keys()) {
    if (seen.has(start)) continue
    const loop: P[] = []
    let prev = -1
    let cur = start
    while (!seen.has(cur)) {
      seen.add(cur)
      loop.push(pointOf(cur))
      const [a, b] = links.get(cur)!
      const next = a !== prev ? a : b
      prev = cur
      cur = next
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

export function polygonArea(loop: P[]): number {
  let a = 0
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    a += (loop[j][0] + loop[i][0]) * (loop[j][1] - loop[i][1])
  }
  return Math.abs(a) / 2
}

function distToSegment(p: P, a: P, b: P): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

/** Ramer–Douglas–Peucker on a closed loop. */
export function simplifyLoop(loop: P[], tol: number): P[] {
  if (tol <= 0 || loop.length < 8) return loop
  const rdp = (pts: P[]): P[] => {
    let best = -1
    let bestD = tol
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distToSegment(pts[i], pts[0], pts[pts.length - 1])
      if (d > bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 0) return [pts[0], pts[pts.length - 1]]
    return [...rdp(pts.slice(0, best + 1)).slice(0, -1), ...rdp(pts.slice(best))]
  }
  // Split at the point farthest from the first, then simplify both halves.
  let far = 0
  let farD = -1
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1])
    if (d > farD) {
      farD = d
      far = i
    }
  }
  const a = rdp(loop.slice(0, far + 1))
  const b = rdp([...loop.slice(far), loop[0]])
  const out = [...a.slice(0, -1), ...b.slice(0, -1)]
  return out.length >= 3 ? out : loop
}

/** Split edges longer than `maxLen`, so boundary triangles stay well-shaped. */
export function resampleLoop(loop: P[], maxLen: number): P[] {
  const out: P[] = []
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    out.push(a)
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen)
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}

function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = o(c, d, a)
  const d2 = o(c, d, b)
  const d3 = o(a, b, c)
  const d4 = o(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Do any two non-adjacent edges of these loops cross? (Simplifying can make them.) */
export function loopsIntersect(loops: P[][]): boolean {
  const segs: { a: P; b: P; loop: number; i: number; n: number }[] = []
  loops.forEach((l, li) => l.forEach((a, i) => segs.push({ a, b: l[(i + 1) % l.length], loop: li, i, n: l.length })))
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const minX = Math.min(s.a[0], s.b[0])
    const maxX = Math.max(s.a[0], s.b[0])
    const minY = Math.min(s.a[1], s.b[1])
    const maxY = Math.max(s.a[1], s.b[1])
    for (let j = i + 1; j < segs.length; j++) {
      const t = segs[j]
      if (Math.max(t.a[0], t.b[0]) < minX || Math.min(t.a[0], t.b[0]) > maxX) continue
      if (Math.max(t.a[1], t.b[1]) < minY || Math.min(t.a[1], t.b[1]) > maxY) continue
      if (s.loop === t.loop && (Math.abs(s.i - t.i) <= 1 || Math.abs(s.i - t.i) === s.n - 1)) continue
      if (segmentsCross(s.a, s.b, t.a, t.b)) return true
    }
  }
  return false
}

// ---- Triangulation ----------------------------------------------------------

export interface RawMesh {
  verts: P[]
  tris: [number, number, number][]
}

/** One triangulation at Steiner spacing `s` (mask px). */
function triangulate(m: Mask, outline: P[][], s: number, seed: number): RawMesh {
  const loops = outline.map((l) => resampleLoop(l, s))
  const points: P[] = []
  const edges: [number, number][] = []
  for (const l of loops) {
    const base = points.length
    l.forEach((p, i) => {
      points.push(p)
      edges.push([base + i, base + ((i + 1) % l.length)])
    })
  }
  const boundary = loops.flatMap((l) => l.map((a, i) => [a, l[(i + 1) % l.length]] as [P, P]))

  // Interior points on a jittered grid, kept clear of the outline so no sliver
  // triangles (or points on constraint edges) appear.
  const rand = mulberry32(seed)
  const clearance = s * 0.45
  for (let y = s / 2; y < m.h; y += s) {
    for (let x = s / 2; x < m.w; x += s) {
      const p: P = [x + (rand() - 0.5) * s * 0.3, y + (rand() - 0.5) * s * 0.3]
      const xi = Math.floor(p[0])
      const yi = Math.floor(p[1])
      if (xi < 0 || yi < 0 || xi >= m.w || yi >= m.h || !m.data[yi * m.w + xi]) continue
      if (boundary.some(([a, b]) => distToSegment(p, a, b) < clearance)) continue
      points.push(p)
    }
  }

  const tris = cdt2d(points, edges, { exterior: false }).filter(([a, b, c]) => {
    const [pa, pb, pc] = [points[a], points[b], points[c]]
    return Math.abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])) > 1e-9
  })
  // Drop points no triangle uses (and reindex).
  const used = new Map<number, number>()
  const verts: P[] = []
  const remap = (i: number) => {
    let j = used.get(i)
    if (j === undefined) {
      j = verts.length
      used.set(i, j)
      verts.push(points[i])
    }
    return j
  }
  return { verts, tris: tris.map(([a, b, c]) => [remap(a), remap(b), remap(c)]) }
}

export interface MeshOptions {
  /** Target triangle count. */
  detail: number
  /** Islands smaller than this fraction of the total area are dropped (specks). */
  minIslandFraction?: number
  seed?: number
}

/**
 * Build a mesh over a (filled) silhouette mask. Aims for `detail` triangles,
 * correcting the spacing once if the first try lands far off.
 */
export function meshFromMask(m: Mask, { detail, minIslandFraction = 0.002, seed = 1 }: MeshOptions): RawMesh {
  const raw = contours(m)
  const total = raw.reduce((a, l) => a + polygonArea(l), 0)
  if (total === 0) return { verts: [], tris: [] }
  const islands = raw.filter((l) => polygonArea(l) >= total * minIslandFraction)

  // Equilateral triangles of side s: area (√3/4)s².
  let s = Math.sqrt((4 * total) / (Math.sqrt(3) * Math.max(8, detail)))
  let mesh: RawMesh = { verts: [], tris: [] }
  for (let attempt = 0; attempt < 2; attempt++) {
    // Simplify relative to triangle size; fall back to finer outlines if that made edges cross.
    let outline = islands
    for (const tol of [Math.min(2.5, Math.max(0.75, s * 0.08)), 0.5, 0]) {
      outline = islands.map((l) => simplifyLoop(l, tol))
      if (tol === 0 || !loopsIntersect(outline)) break
    }
    mesh = triangulate(m, outline, s, seed)
    const ratio = mesh.tris.length / detail
    if (ratio > 0.8 && ratio < 1.25) break
    s *= Math.sqrt(ratio)
  }
  return mesh
}

/** Connected components of a mesh (by shared vertices), as triangle index lists. */
export function meshComponents(tris: [number, number, number][], vertCount: number): number[][] {
  const parent = Array.from({ length: vertCount }, (_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (const [a, b, c] of tris) {
    parent[find(a)] = find(b)
    parent[find(b)] = find(c)
  }
  const groups = new Map<number, number[]>()
  tris.forEach((t, i) => {
    const r = find(t[0])
    groups.get(r)?.push(i) ?? groups.set(r, [i])
  })
  return [...groups.values()]
}
