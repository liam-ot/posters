import type { BaseLayer, LayerAnimation, VectorPath } from '../types/poster'

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

export interface PuppetMotion {
  id: string
  name: string
  /** Per-pin pose overrides for this motion. */
  poses?: Record<string, UV>
  /** pin id → loop animations (pin presets). */
  animations: Record<string, LayerAnimation[]>
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
  /** +1 on every save; instances refresh their snapshot when it is newer. */
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

/**
 * A linked character placed in a poster. Renders from `snapshot` only.
 * Joins the `Layer` union in Phase 1, together with every `switch (layer.type)`.
 */
export interface PuppetLayer extends Omit<BaseLayer, 'type'> {
  type: 'puppet'
  assetId: string
  /** The asset version the snapshot was taken from. */
  assetVersion: number
  /** Undefined = still, in the base pose. */
  motionId?: string
  snapshot: PuppetAsset
  /** Normalised colour → replacement, from the palette swatches. */
  colorOverrides?: Record<string, string>
  /** Frozen: stops following library edits. */
  detached?: boolean
}
