import type { Matrix2D, VectorPath } from '../types/poster'
import { invert, multiply } from '../render/matrix'
import { displaceSegments, displaceSegs, preparedSegments, segsToPathData, type Seg } from '../animation/wobble'
import { prepareArap, type ArapSolver, type Handle } from './arap'
import { makeLocator, placeLocated, type Located } from './bind'
import { isMeshCurrent } from './meshKey'
import type { PuppetAsset, PuppetMesh, PuppetPin, UV } from './types'

/**
 * Puppet deformation glue (docs/adr/0012): pin positions → solved mesh → every
 * path point moved with its triangle. Works in character space and returns new
 * path data in each path's own local coordinates, so an instance's usual
 * viewBox → layer-box stretch applies unchanged (docs/adr/0013).
 */

/** Longest straight run before it's split so it can bend, character px. */
const BEND_SPACING = 8

/** Where each pin sits: motion pose, else base pose, else where it was placed. */
export function pinPositions(asset: PuppetAsset, motionId?: string): Map<string, UV> {
  const motion = motionId ? asset.motions.find((m) => m.id === motionId) : undefined
  return new Map(asset.puppet.pins.map((p) => [p.id, motion?.poses?.[p.id] ?? p.pose ?? p.at]))
}

const isPin = (p: PuppetPin) => p.kind === 'pin'

/** Source paths' transforms into character space (viewBox → natural size). */
function charTransforms(asset: PuppetAsset): Matrix2D[] {
  const { viewBox: vb, paths } = asset.source
  const sx = asset.size.width / vb.width
  const sy = asset.size.height / vb.height
  const base: Matrix2D = [sx, 0, 0, sy, -vb.x * sx, -vb.y * sy]
  return paths.map((p) => multiply(base, p.transform))
}

// ---- Caches -----------------------------------------------------------------

const locators = new Map<string, ReturnType<typeof makeLocator>>()
function locatorFor(mesh: PuppetMesh) {
  let l = locators.get(mesh.key)
  if (!l) {
    l = makeLocator(mesh.verts, mesh.tris)
    if (locators.size > 16) locators.delete(locators.keys().next().value!)
    locators.set(mesh.key, l)
  }
  return l
}

interface Prepared {
  solver: ArapSolver
  pins: PuppetPin[]
}
const solvers = new Map<string, Prepared>()
/** Factorise once per mesh + pin placement; dragging pins only changes targets. */
function solverFor(mesh: PuppetMesh, pins: PuppetPin[]): Prepared {
  const key = `${mesh.key}|${pins.map((p) => `${p.id}:${p.kind}:${p.at[0]},${p.at[1]}:${p.radius ?? ''}:${p.amount ?? ''}`).join(';')}`
  let s = solvers.get(key)
  if (!s) {
    const locate = locatorFor(mesh)
    const handlePins = pins.filter(isPin)
    const handles: Handle[] = handlePins.map((p) => {
      const l = locate(p.at[0], p.at[1])
      return { tri: l.tri, bary: l.bary }
    })
    const stiff = pins
      .filter((p) => p.kind === 'starch')
      .map((p) => ({ x: p.at[0], y: p.at[1], radius: p.radius ?? 40, amount: p.amount ?? 0.6 }))
    s = { solver: prepareArap(mesh, handles, stiff), pins: handlePins }
    if (solvers.size > 8) solvers.delete(solvers.keys().next().value!)
    solvers.set(key, s)
  }
  return s
}

interface PathBinding {
  segs: Seg[]
  located: Located[]
  toChar: Matrix2D
  toLocal: Matrix2D
}
const bindings = new WeakMap<VectorPath[], Map<string, PathBinding[]>>()
/** Every point of every path, located in the mesh. Cached per source paths + mesh. */
function bindingsFor(asset: PuppetAsset, mesh: PuppetMesh): PathBinding[] {
  const paths = asset.source.paths
  let byMesh = bindings.get(paths)
  if (!byMesh) bindings.set(paths, (byMesh = new Map()))
  let out = byMesh.get(mesh.key)
  if (out) return out
  const locate = locatorFor(mesh)
  const transforms = charTransforms(asset)
  out = paths.map((p, i) => {
    const toChar = transforms[i]
    const scale = Math.sqrt(Math.abs(toChar[0] * toChar[3] - toChar[1] * toChar[2])) || 1
    const segs = preparedSegments(p.d, BEND_SPACING / scale)
    const located: Located[] = []
    displaceSegments(segs, (x, y) => {
      located.push(locate(toChar[0] * x + toChar[2] * y + toChar[4], toChar[1] * x + toChar[3] * y + toChar[5]))
      return [0, 0]
    })
    return { segs, located, toChar, toLocal: invert(toChar) }
  })
  byMesh.set(mesh.key, out)
  return out
}

// ---- Deformation --------------------------------------------------------------

/**
 * Solved (deformed) mesh vertices for these pin positions, or null when nothing
 * moves or there's no usable mesh — then geometry stays exactly as drawn.
 */
export function solveMesh(asset: PuppetAsset, positions: Map<string, UV>): Float64Array | null {
  const mesh = asset.puppet.mesh
  if (!mesh || !isMeshCurrent(asset) || mesh.tris.length === 0) return null
  const pins = asset.puppet.pins.filter(isPin)
  if (pins.length === 0) return null
  // Identity guarantee: nothing posed ⇒ no solve, original geometry (docs/adr/0012).
  const moved = pins.some((p) => {
    const q = positions.get(p.id) ?? p.at
    return q[0] !== p.at[0] || q[1] !== p.at[1]
  })
  if (!moved) return null

  const { solver, pins: order } = solverFor(mesh, asset.puppet.pins)
  const targets = new Float64Array(order.length * 2)
  order.forEach((p, i) => {
    const q = positions.get(p.id) ?? p.at
    targets[2 * i] = q[0]
    targets[2 * i + 1] = q[1]
  })
  return solver.solve(targets)
}

/**
 * Deformed geometry for each source path (same order), as numeric segments in
 * the path's local units; null when nothing moves. Used every frame while a
 * character animates — no strings are written or parsed.
 */
export function deformSegs(asset: PuppetAsset, positions: Map<string, UV>): Seg[][] | null {
  const deformed = solveMesh(asset, positions)
  if (!deformed) return null
  const mesh = asset.puppet.mesh!
  return bindingsFor(asset, mesh).map((b) => {
    let k = 0
    const L = b.toLocal
    return displaceSegs(b.segs, (x, y) => {
      const [cx, cy] = placeLocated(b.located[k++], mesh.tris, deformed)
      return [L[0] * cx + L[2] * cy + L[4] - x, L[1] * cx + L[3] * cy + L[5] - y]
    })
  })
}

/**
 * Deformed path data for each source path (same order), or null when nothing
 * moves — then callers keep the original paths, exactly.
 */
export function deformPaths(asset: PuppetAsset, positions: Map<string, UV>): string[] | null {
  return deformSegs(asset, positions)?.map(segsToPathData) ?? null
}

const posed = new WeakMap<PuppetAsset, Map<string, string[] | null>>()
/** `deformPaths` for a stored pose (base or a motion's), cached per asset object. */
export function posedPathData(asset: PuppetAsset, motionId?: string): string[] | null {
  let byMotion = posed.get(asset)
  if (!byMotion) posed.set(asset, (byMotion = new Map()))
  const key = motionId ?? ''
  if (!byMotion.has(key)) byMotion.set(key, deformPaths(asset, pinPositions(asset, motionId)))
  return byMotion.get(key)!
}

/** Locate a point in the character's mesh (for placing pins); null if outside it. */
export function locateInMesh(asset: PuppetAsset, x: number, y: number): Located | null {
  const mesh = asset.puppet.mesh
  if (!mesh || mesh.tris.length === 0) return null
  const l = locatorFor(mesh)(x, y)
  return l.inside ? l : null
}
