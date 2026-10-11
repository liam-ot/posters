/**
 * Locate points in a triangle mesh by barycentric coordinates, so they can
 * follow the mesh when it deforms (docs/adr/0012). Pure.
 */

export interface Located {
  tri: number
  bary: [number, number, number]
  /** False when the point lies outside every triangle (bound to the nearest). */
  inside: boolean
}

function barycentric(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): [number, number, number] {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  if (Math.abs(d) < 1e-12) return [1 / 3, 1 / 3, 1 / 3]
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
  return [u, v, 1 - u - v]
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

/** A point locator over a mesh, with a uniform grid for speed. */
export function makeLocator(verts: ArrayLike<number>, tris: ArrayLike<number>) {
  const nt = tris.length / 3
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < verts.length; i += 2) {
    minX = Math.min(minX, verts[i])
    maxX = Math.max(maxX, verts[i])
    minY = Math.min(minY, verts[i + 1])
    maxY = Math.max(maxY, verts[i + 1])
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(nt)))
  const cw = (maxX - minX) / cols || 1
  const ch = (maxY - minY) / cols || 1
  const cells: number[][] = Array.from({ length: cols * cols }, () => [])
  const cellOf = (x: number, y: number) => [
    Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / cw))),
    Math.min(cols - 1, Math.max(0, Math.floor((y - minY) / ch))),
  ]
  const corner = (t: number, k: number) => tris[t * 3 + k] * 2
  for (let t = 0; t < nt; t++) {
    const xs = [0, 1, 2].map((k) => verts[corner(t, k)])
    const ys = [0, 1, 2].map((k) => verts[corner(t, k) + 1])
    const [c0, r0] = cellOf(Math.min(...xs), Math.min(...ys))
    const [c1, r1] = cellOf(Math.max(...xs), Math.max(...ys))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(t)
  }

  const baryIn = (t: number, x: number, y: number) => {
    const a = corner(t, 0)
    const b = corner(t, 1)
    const c = corner(t, 2)
    return barycentric(x, y, verts[a], verts[a + 1], verts[b], verts[b + 1], verts[c], verts[c + 1])
  }

  return (x: number, y: number): Located => {
    if (nt === 0) return { tri: -1, bary: [0, 0, 0], inside: false }
    const [c, r] = cellOf(x, y)
    const eps = -1e-9
    for (const t of cells[r * cols + c]) {
      const b = baryIn(t, x, y)
      if (b[0] >= eps && b[1] >= eps && b[2] >= eps) return { tri: t, bary: b, inside: true }
    }
    // Outside the mesh (stroke overhang, anti-aliasing margin): follow the nearest triangle.
    let best = 0
    let bestD = Infinity
    for (let t = 0; t < nt; t++) {
      const a = corner(t, 0)
      const b = corner(t, 1)
      const cc = corner(t, 2)
      const d = Math.min(
        distToSegment(x, y, verts[a], verts[a + 1], verts[b], verts[b + 1]),
        distToSegment(x, y, verts[b], verts[b + 1], verts[cc], verts[cc + 1]),
        distToSegment(x, y, verts[cc], verts[cc + 1], verts[a], verts[a + 1]),
      )
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
    return { tri: best, bary: baryIn(best, x, y), inside: false }
  }
}

/** Position of a located point in a (deformed) copy of the mesh. */
export function placeLocated(l: Located, tris: ArrayLike<number>, verts: ArrayLike<number>): [number, number] {
  const a = tris[l.tri * 3] * 2
  const b = tris[l.tri * 3 + 1] * 2
  const c = tris[l.tri * 3 + 2] * 2
  return [
    l.bary[0] * verts[a] + l.bary[1] * verts[b] + l.bary[2] * verts[c],
    l.bary[0] * verts[a + 1] + l.bary[1] * verts[b + 1] + l.bary[2] * verts[c + 1],
  ]
}
