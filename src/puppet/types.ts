import type { BaseLayer, TimeUnit, VectorPath } from '../types/poster'

/**
 * Character library + puppet pins (docs/plans/puppet-pins.md, docs/adr/0012, 0013).
 * Positions are in character space: the character's natural-size px, so a
 * resized instance is just the usual viewBox → layer-box stretch.
 */
export type UV = [number, number]

export interface PuppetPin {
  id: string
  /** "Left hand"; the UI falls back to "Pin n". */
  name?: string
  /** `starch` stiffens the area around it; it is not a positional constraint. */
  kind: 'pin' | 'starch'
  /** Where it was placed on the undeformed artwork. */
  at: UV
  /** Base pose; absent = at `at`. */
  pose?: UV
  /** Swing pivot; the pin inherits its parent's motion (pins only). */
  parent?: string
  /** starch: extent in px. */
  radius?: number
  /** starch: 0..1 stiffness. */
  amount?: number
}

export type PinPresetId = 'swing' | 'bob' | 'circle' | 'bounce'

/** A repeating move on one pin within a motion (docs/plans/puppet-pins.md §4.6). */
export interface PinAnimation {
  id: string
  preset: PinPresetId
  enabled: boolean
  period: number
  periodUnit: TimeUnit
  /** 0..1 of the period. */
  phaseOffset?: number
  params: Record<string, number | string | boolean>
}

/**
 * How a motion moves between the base pose and its own pose: on every cycle it
 * starts in the motion's pose and goes to the base pose and back (`smooth`),
 * holds each (`pop`), or hits the motion's pose and eases out (`hit`).
 */
export interface PoseLoop {
  enabled: boolean
  shape: 'smooth' | 'pop' | 'hit'
  period: number
  periodUnit: TimeUnit
  phaseOffset?: number
}

export interface PuppetMotion {
  id: string
  name: string
  /** Per-pin pose overrides for this motion. */
  poses?: Record<string, UV>
  poseLoop?: PoseLoop
  /** pin id → loop animations. */
  animations: Record<string, PinAnimation[]>
  /** Suggested loop length, for the studio preview. */
  lengthBars?: number
}

export interface PuppetMesh {
  /** Hash of the inputs it was built from; a mismatch means "rebuild". */
  key: string
  /** Flat [x0, y0, x1, y1, …] in character space. */
  verts: number[]
  /** Flat vertex indices, three per triangle. */
  tris: number[]
}

/** The vector artwork a character is made of — the same fields an SvgLayer has. */
export interface VectorSource {
  viewBox: { x: number; y: number; width: number; height: number }
  paths: VectorPath[]
  sourceSvg?: string
  importWarnings?: string[]
}

export interface PuppetAsset {
  id: string
  /** The Library will hold other kinds later. */
  kind: 'puppet'
  schemaVersion: 1
  name: string
  /**
   * Revision stamp, changed on every edit (a timestamp). Instances refresh their
   * snapshot whenever it *differs* — not only when it's larger — so undoing in the
   * studio propagates too.
   */
  version: number
  createdAt: string
  updatedAt: string
  /** Natural size = character space. */
  size: { width: number; height: number }
  source: VectorSource
  puppet: {
    /** Mesh density (target triangle count), like After Effects' "Triangles". */
    detail: number
    mesh?: PuppetMesh
    pins: PuppetPin[]
  }
  motions: PuppetMotion[]
  /** Studio-only preview timing. */
  preview?: { bpm?: number; beatsPerBar?: number; durationSec?: number }
}

export type LibraryAsset = PuppetAsset

/** Listing entry for the Library (data/assets/index.json). */
export interface AssetSummary {
  id: string
  kind: LibraryAsset['kind']
  name: string
  updatedAt: string
  width: number
  height: number
  motions: number
}

/** A linked character placed in a poster. Renders from `snapshot` only (docs/adr/0013). */
export interface PuppetLayer extends BaseLayer {
  type: 'puppet'
  assetId: string
  /** The asset `version` the snapshot was taken from. */
  assetVersion: number
  /** Undefined = still, in the base pose. */
  motionId?: string
  snapshot: PuppetAsset
  /** Normalised colour → replacement, from the palette swatches. */
  colorOverrides?: Record<string, string>
  /** Frozen: stops following library edits. */
  detached?: boolean
}
