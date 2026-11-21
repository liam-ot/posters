/**
 * Two-step as-rigid-as-possible shape manipulation (Igarashi, Moscovich & Hughes
 * 2005), used to bend a character's mesh with pins (docs/adr/0012). Pure.
 *
 * Step 1 finds the deformation that keeps every triangle *similar* to its rest
 * shape (rotation + uniform scale allowed). Step 2 fits each triangle's rest
 * shape to that result with rotation only and solves again, which removes the
 * scaling — the "rubbery but not inflating" look.
 *
 * Pins are soft constraints at barycentric positions inside a triangle, so the
 * factorised matrices depend only on mesh + pin *placement*; moving pins only
 * changes the right-hand sides (two triangular solves per step, per frame).
 */

export interface ArapInput {
  /** Rest positions, flat [x0, y0, x1, y1, …]. */
  verts: ArrayLike<number>
  /** Vertex indices, three per triangle. */
  tris: ArrayLike<number>
}

/** A pin attached inside a triangle. */
export interface Handle {
  tri: number
  bary: [number, number, number]
}

/** A starch area: triangles whose centroid is within `radius` resist bending. */
export interface Stiffness {
  x: number
  y: number
  radius: number
  /** 0..1 */
  amount: number
}

const PIN_WEIGHT = 1e4
// Keeps every system solvable (one pin, unpinned islands) by pulling weakly to
// rest; small enough to be invisible next to the shape energy.
const REST_WEIGHT = 1e-5
const STARCH_GAIN = 40

/** Dense symmetric positive-definite matrix → its Cholesky factor, in place (lower). */
function cholesky(a: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j]
    for (let k = 0; k < j; k++) d -= a[j * n + k] * a[j * n + k]
    if (d <= 0) throw new Error('ARAP system is not positive definite')
    const ljj = Math.sqrt(d)
    a[j * n + j] = ljj
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j]
      for (let k = 0; k < j; k++) s -= a[i * n + k] * a[j * n + k]
      a[i * n + j] = s / ljj
    }
  }
  return a
}

/** Solve L Lᵀ x = b with a factor from `cholesky`. */
function cholSolve(l: Float64Array, n: number, b: Float64Array): Float64Array {
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let k = 0; k < i; k++) s -= l[i * n + k] * y[k]
    y[i] = s / l[i * n + i]
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]
    for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k]
    x[i] = s / l[i * n + i]
  }
  return x
}

/** Per-triangle weights from starch areas (1 = normal). */
function triangleWeights(input: ArapInput, stiff: Stiffness[]): Float64Array {
  const nt = input.tris.length / 3
  const w = new Float64Array(nt).fill(1)
  if (!stiff.length) return w
  const v = input.verts
  for (let t = 0; t < nt; t++) {
    const a = input.tris[t * 3] * 2
    const b = input.tris[t * 3 + 1] * 2
    const c = input.tris[t * 3 + 2] * 2
    const cx = (v[a] + v[b] + v[c]) / 3
    const cy = (v[a + 1] + v[b + 1] + v[c + 1]) / 3
    for (const s of stiff) {
      const d = Math.hypot(cx - s.x, cy - s.y) / Math.max(1e-6, s.radius)
      if (d >= 1) continue
      // Smooth falloff to the edge of the area.
      const f = 1 - d * d * (3 - 2 * d)
      w[t] *= 1 + s.amount * STARCH_GAIN * f
    }
  }
  return w
}

export interface ArapSolver {
  /** Deformed vertex positions for pin targets (flat [x, y] per handle, same order). */
  solve(targets: ArrayLike<number>): Float64Array
}

export function prepareArap(input: ArapInput, handles: Handle[], stiff: Stiffness[] = []): ArapSolver {
  const rest = Float64Array.from(input.verts)
  const tris = input.tris
  const n = rest.length / 2
  const nt = tris.length / 3
  const tw = triangleWeights(input, stiff)

  // ---- Step 1: similarity-invariant energy, 2n × 2n (x, y interleaved) ----
  const N1 = 2 * n
  const g = new Float64Array(N1 * N1)
  // Local coordinates of each vertex in the frame of the opposite edge.
  const local = new Float64Array(nt * 6)
  const add2 = (k: number, l: number, m: [number, number, number, number], w: number) => {
    // block (k, l) += w · m, where m is 2×2 row-major
    g[(2 * k) * N1 + 2 * l] += w * m[0]
    g[(2 * k) * N1 + 2 * l + 1] += w * m[1]
    g[(2 * k + 1) * N1 + 2 * l] += w * m[2]
    g[(2 * k + 1) * N1 + 2 * l + 1] += w * m[3]
  }
  for (let t = 0; t < nt; t++) {
    for (let r = 0; r < 3; r++) {
      const i0 = tris[t * 3 + r]
      const i1 = tris[t * 3 + ((r + 1) % 3)]
      const i2 = tris[t * 3 + ((r + 2) % 3)]
      const ex = rest[2 * i2] - rest[2 * i1]
      const ey = rest[2 * i2 + 1] - rest[2 * i1 + 1]
      const dx = rest[2 * i0] - rest[2 * i1]
      const dy = rest[2 * i0 + 1] - rest[2 * i1 + 1]
      const e2 = ex * ex + ey * ey || 1e-12
      // v0 = v1 + x·e + y·R(e), R = 90° CCW = [[0,-1],[1,0]]
      const x = (dx * ex + dy * ey) / e2
      const y = (dx * -ey + dy * ex) / e2
      local[t * 6 + r * 2] = x
      local[t * 6 + r * 2 + 1] = y
      // err = B0 v0 + B1 v1 + B2 v2, with B0 = I, B1 = (x-1)I + yR, B2 = -xI - yR
      const B: [number, number, number, number][] = [
        [1, 0, 0, 1],
        [x - 1, -y, y, x - 1],
        [-x, y, -y, -x],
      ]
      const idx = [i0, i1, i2]
      for (let k = 0; k < 3; k++) {
        for (let l = 0; l < 3; l++) {
          const a = B[k]
          const b = B[l]
          // aᵀ b
          add2(idx[k], idx[l], [
            a[0] * b[0] + a[2] * b[2],
            a[0] * b[1] + a[2] * b[3],
            a[1] * b[0] + a[3] * b[2],
            a[1] * b[1] + a[3] * b[3],
          ], tw[t])
        }
      }
    }
  }

  // ---- Step 2: edge-length (rotation-only) energy, n × n, shared by x and y ----
  const h = new Float64Array(n * n)
  for (let t = 0; t < nt; t++) {
    for (let r = 0; r < 3; r++) {
      const i = tris[t * 3 + r]
      const j = tris[t * 3 + ((r + 1) % 3)]
      h[i * n + i] += tw[t]
      h[j * n + j] += tw[t]
      h[i * n + j] -= tw[t]
      h[j * n + i] -= tw[t]
    }
  }

  // ---- Soft pin constraints + rest regulariser ----
  for (const hd of handles) {
    const idx = [tris[hd.tri * 3], tris[hd.tri * 3 + 1], tris[hd.tri * 3 + 2]]
    for (let k = 0; k < 3; k++) {
      for (let l = 0; l < 3; l++) {
        const c = PIN_WEIGHT * hd.bary[k] * hd.bary[l]
        g[(2 * idx[k]) * N1 + 2 * idx[l]] += c
        g[(2 * idx[k] + 1) * N1 + 2 * idx[l] + 1] += c
        h[idx[k] * n + idx[l]] += c
      }
    }
  }
  for (let i = 0; i < N1; i++) g[i * N1 + i] += REST_WEIGHT
  for (let i = 0; i < n; i++) h[i * n + i] += REST_WEIGHT

  const lg = cholesky(g, N1)
  const lh = cholesky(h, n)

  return {
    solve(targets) {
      // Step 1
      const b1 = new Float64Array(N1)
      for (let i = 0; i < N1; i++) b1[i] = REST_WEIGHT * rest[i]
      handles.forEach((hd, p) => {
        for (let k = 0; k < 3; k++) {
          const v = tris[hd.tri * 3 + k]
          b1[2 * v] += PIN_WEIGHT * hd.bary[k] * targets[2 * p]
          b1[2 * v + 1] += PIN_WEIGHT * hd.bary[k] * targets[2 * p + 1]
        }
      })
      const v1 = cholSolve(lg, N1, b1)

      // Step 2: fit each rest triangle to step 1 with a rotation, then match its edges.
      const bx = new Float64Array(n)
      const by = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        bx[i] = REST_WEIGHT * rest[2 * i]
        by[i] = REST_WEIGHT * rest[2 * i + 1]
      }
      for (let t = 0; t < nt; t++) {
        const id = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]]
        const pcx = (rest[2 * id[0]] + rest[2 * id[1]] + rest[2 * id[2]]) / 3
        const pcy = (rest[2 * id[0] + 1] + rest[2 * id[1] + 1] + rest[2 * id[2] + 1]) / 3
        const qcx = (v1[2 * id[0]] + v1[2 * id[1]] + v1[2 * id[2]]) / 3
        const qcy = (v1[2 * id[0] + 1] + v1[2 * id[1] + 1] + v1[2 * id[2] + 1]) / 3
        let dot = 0
        let cross = 0
        for (const v of id) {
          const px = rest[2 * v] - pcx
          const py = rest[2 * v + 1] - pcy
          const qx = v1[2 * v] - qcx
          const qy = v1[2 * v + 1] - qcy
          dot += px * qx + py * qy
          cross += px * qy - py * qx
        }
        const len = Math.hypot(dot, cross) || 1
        const cos = dot / len
        const sin = cross / len
        for (let r = 0; r < 3; r++) {
          const i = id[r]
          const j = id[(r + 1) % 3]
          const ex = rest[2 * i] - rest[2 * j]
          const ey = rest[2 * i + 1] - rest[2 * j + 1]
          const fx = cos * ex - sin * ey
          const fy = sin * ex + cos * ey
          bx[i] += tw[t] * fx
          by[i] += tw[t] * fy
          bx[j] -= tw[t] * fx
          by[j] -= tw[t] * fy
        }
      }
      handles.forEach((hd, p) => {
        for (let k = 0; k < 3; k++) {
          const v = tris[hd.tri * 3 + k]
          bx[v] += PIN_WEIGHT * hd.bary[k] * targets[2 * p]
          by[v] += PIN_WEIGHT * hd.bary[k] * targets[2 * p + 1]
        }
      })
      const xs = cholSolve(lh, n, bx)
      const ys = cholSolve(lh, n, by)
      const out = new Float64Array(2 * n)
      for (let i = 0; i < n; i++) {
        out[2 * i] = xs[i]
        out[2 * i + 1] = ys[i]
      }
      return out
    },
  }
}
