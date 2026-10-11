# Plan: Character library & puppet studio — bend and animate parts of vector artwork (v1)

> **For the implementing agent:** work through the phases **in order**. At the end
> of every phase: run `pnpm typecheck` and `pnpm test`, verify in the running app
> (`.claude/launch.json` → `poster-studio`), add notes under §8, tick §9, then
> **stop and report to the user**. Do not start the next phase until the user
> confirms. Match the existing code style: small focused modules, terse comments
> explaining *why*, Tailwind with the `var(--color-*)` tokens, zustand + immer
> (+ zundo for undo), Radix for popovers/dialogs. Read `docs/plans/svg-animation.md`
> §4 and `docs/adr/` first — this builds directly on that work.

---

## 1. Goal

Let users animate **parts** of a single piece of vector artwork — e.g. make a
character's arms and legs dance — even when the artwork was never split into
parts. It must be a **general, reusable tool**: users will bring many SVGs, often
traced bitmaps where an arm is not a separate path (the taco in "Poster 5" is one
18,700-character outline containing body, arms, legs and hat).

Two halves:

1. **Puppet deformation** (After Effects' Puppet tool model): the app builds a
   triangle mesh over the artwork's silhouette; the user **drops pins** anywhere;
   dragging a pin bends the artwork smoothly ("as rigid as possible"); pins can be
   **chained**, given **loop animations** synced to the BPM with a **phase
   offset**, and **starch pins** stiffen areas.
2. **A separate Library area with a Puppet studio** (Rive nested artboards / AE
   precomps / Figma components): characters are rigged once in their own
   workspace, hold several **named motions** (Idle, Dance, Wave…), and are placed
   into any poster as a **linked instance** layer that picks a motion and follows
   the poster's BPM.

## 2. Decisions already made (do not re-litigate)

| Topic | Decision |
|---|---|
| Deformation | Mesh-based puppet deformation (two-step ARAP), **not** distance-weighted point dragging — that bleeds across nearby parts (two legs close together). |
| Where rigging happens | **Only in the Puppet studio** (a new top-level area). No pins on poster layers. An SVG or shape layer gets **"Open in puppet studio"**, which turns it into a library character and replaces the layer with a linked instance. |
| Library scope | A **Library** area whose first (and in v1 only) asset type is `puppet`. Structure storage, API and UI so other asset kinds (animated SVGs, logo lock-ups) can be added later. |
| Linking | Instances are **linked**: editing a character updates every poster using it. An instance can be **detached** (frozen; stops updating). |
| Motions | A character holds **several named motions**; each instance picks one (or none = still in its base pose). Normal layer animations (slide-in, fade-out…) still apply on top of the instance. |
| Motion timing | Pin loops use the usual `period` + `sec \| beat \| bar` units. Beat/bar periods follow **the poster's BPM**; the studio has a preview BPM. |
| Pin motion | **Loop presets only** (no keyframes): **swing** around another pin, **bob/shake**, **circle**, **beat squash**. |
| Posing | Dragging a pin (while not playing) sets a **pose**. Character has a base pose; a motion may override poses. Loops move around the pose. |
| Chains | A pin may have a **parent** pin: it swings around its parent and inherits the parent's motion (forward kinematics). |
| Stiffness | **Starch pins** (position + radius + amount), as in After Effects. Lasso/paint stiffness is later. |
| Phase offset | New optional `phaseOffset` (0..1 of a period) on **all** loop animations — poster layer loops too. |
| Layer types | Characters are made from `svg` and `shape` layers / SVG files (vector). Raster images later (§3). |
| Output | Deformed geometry stays **vector** (path points are moved): export is exact and crisp. |
| Schema | Posters keep `schemaVersion: 1`; new fields/types optional; extend `normalizeDoc()`. Assets get their own `schemaVersion: 1`. |

**Implementation decisions made during scoping (also binding):**

- **Snapshots.** An instance layer stores a **snapshot** of the character (source,
  mesh, pins, motions) plus the asset `version` it came from. Rendering and export
  use only the snapshot, so they never wait on the network and are deterministic.
  On poster open (and when returning from the studio) snapshots are refreshed if the
  library version is newer. Deleting a character warns with its usage count; posters
  keep their snapshot and become detached.
- **Solve in character space.** Deformation is solved in the character's own
  natural-size coordinates, then the result is stretched to the instance box (like
  scaling an AE precomp). Resizing an instance never re-factorises anything.
- **Shapes → characters** freeze the shape's generated paths as vector source.
- **Colour overrides per instance** (reusing the SVG palette swatches), so one
  character can match each poster's palette.

## 3. Out of scope (future work — do not build)

- Puppeting raster `image` layers (warp the bitmap per triangle). Keep mesh/solver
  independent of path data so this is a renderer-only addition later.
- Text/generator puppeting; other Library asset kinds.
- Keyframed pin positions (v2 keyframe editor). Pin animations must be ordinary
  channel sources so keyframes can be another source later (ADR-0001).
- Lasso/painted stiffness; overlap/depth pins; auto-rigging (detecting limbs).
- Bending gradients: gradient fills keep their un-deformed geometry (known limitation).
- Editing pins from inside a poster; nested characters; sharing libraries between machines.

---

## 4. Architecture

### 4.1 Overview

```
Library (data/assets/*.json)          Poster (data/posters/*.json)
┌──────────────────────────┐          ┌──────────────────────────────────┐
│ PuppetAsset              │  link +  │ PuppetLayer (type 'puppet')      │
│  source: vector paths    │ snapshot │  assetId, assetVersion, motionId │
│  puppet: mesh, pins      ├─────────►│  snapshot: PuppetAsset           │
│  motions: Dance, Idle…   │          │  colorOverrides, detached        │
└──────────────────────────┘          │  + normal layer animations       │
        ▲ edited in                    └──────────────────────────────────┘
   Puppet studio (view 'studio')

Render (canvas + export, shared via src/render/):
 snapshot ─► pin positions at t (motion + poster BPM) ─► ARAP solve (char space, cached)
          ─► move bound path points (+ wobble in same pass) ─► stretch to layer box
          ─► applyPathFrames (draw-on etc.) ─► Konva.Path configs
```

Suggested files:

- `src/puppet/types.ts` — data model (§4.2).
- `src/puppet/silhouette.ts` — rasterise → alpha mask → filled silhouette (browser-only).
- `src/puppet/mesh.ts` — **pure**: silhouette contours → triangle mesh.
- `src/puppet/arap.ts` — **pure**: precompute + solve.
- `src/puppet/bind.ts` — **pure**: point → (triangle, barycentric) binding.
- `src/puppet/pins.ts`, `src/puppet/pinPresets.ts` — **pure**: pin hierarchy + presets → pin positions at `t`.
- `src/puppet/deform.ts` — glue used by `src/render/paths.ts`.
- `src/library/` — asset API client, `useLibrary` store, snapshot sync.
- `server/` — `/api/assets` routes.
- `src/ui/Library.tsx` (gallery tab), `src/studio/` — studio view, its store, canvas overlay, panels.

### 4.2 Data model

```ts
type UV = [number, number] // character space, natural-size px (see "Solve in character space")

interface PuppetPin {
  id: string
  name?: string                 // "Left hand"; default "Pin n"
  kind: 'pin' | 'starch'
  at: UV                        // where it was placed on the undeformed artwork
  pose?: UV                     // base pose; absent = at `at`
  parent?: string               // pin id; swing pivot + inherits parent's motion (pins only)
  radius?: number               // starch: extent in px
  amount?: number               // starch: 0..1 stiffness
}

interface PuppetMotion {
  id: string
  name: string                                  // "Dance"
  poses?: Record<string, UV>                    // per-pin pose overrides for this motion
  animations: Record<string, LayerAnimation[]>  // pin id → loops (pin presets, §4.6)
  lengthBars?: number                           // suggested loop length, for the studio preview / "fit"
}

interface PuppetAsset {
  id: string
  kind: 'puppet'                // Library is multi-kind later
  schemaVersion: 1
  name: string
  version: number               // +1 on every save; drives snapshot refresh
  createdAt: string
  updatedAt: string
  size: { width: number; height: number }       // natural size (character space)
  source: {                                     // vector artwork, same shape as SvgLayer's
    viewBox: { x: number; y: number; width: number; height: number }
    paths: VectorPath[]
    sourceSvg?: string
    importWarnings?: string[]
  }
  puppet: {
    detail: number              // mesh density (target triangles), like AE's "Triangles"
    mesh?: { key: string; verts: number[]; tris: number[] }  // flat arrays, char space
    pins: PuppetPin[]
  }
  motions: PuppetMotion[]
  preview?: { bpm?: number; beatsPerBar?: number; durationSec?: number }  // studio only
}

interface PuppetLayer extends BaseLayer {
  type: 'puppet'
  assetId: string
  assetVersion: number
  motionId?: string             // undefined = still (base pose)
  snapshot: PuppetAsset
  colorOverrides?: Record<string, string>  // normalised colour → replacement (palette swatches)
  detached?: boolean
}

// LayerAnimation gains:  phaseOffset?: number   (0..1 of the period, loops only)
```

Round stored numbers (≈3 decimals in px) to keep files small; a 500-triangle mesh
is roughly 10 KB of JSON. A snapshot duplicates the asset per poster — acceptable.

### 4.3 Library storage & linking

- **Server**: `data/assets/<id>.json` + `<id>.thumb.png`, routes mirroring posters:
  `GET /api/assets`, `GET/PUT/DELETE /api/assets/:id`, `GET /api/assets/:id/thumb`,
  `GET /api/assets/:id/usage` (scans posters for `assetId`; returns poster ids/names).
  Reuse the posters route code (extract a small generic "JSON collection" helper
  rather than copy-pasting).
- **Client**: `src/library/api.ts`, `useLibrary` store (list + cache by id).
- **Snapshot refresh** (`src/library/sync.ts`): after `loadDoc` and when returning
  from the studio, for every non-detached `puppet` layer whose asset exists with a
  higher `version`, replace `snapshot` + `assetVersion`. Do this **outside undo
  history** (zundo `pause()`/`resume()`), then mark the doc for autosave. If the
  pin a motion animates no longer exists, those animations are simply skipped.
- **Delete**: confirm dialog listing posters that use it; posters keep their
  snapshot and get `detached: true` on next open (asset missing ⇒ detached).
- **Detach** (Inspector): sets `detached: true`. **Re-link** is offered if the asset
  still exists (refresh snapshot from the library).

### 4.4 Building the mesh (`silhouette.ts`, `mesh.ts`)

1. **Rasterise** the character's source paths (undeformed) to an offscreen canvas,
   longest side ≈ 512 px, with Konva (reuse `pathConfig`).
2. **Alpha mask** (`alpha > 0`), then **close small gaps**: dilate ~1–2 px, erode
   back (hairline breaks in traced line art must not split parts).
3. **Fill holes**: flood-fill "outside" from the border; silhouette = not outside.
   Face details inside a head deform with it; the gap between two legs stays empty.
4. **Contours**: marching squares → closed polygons (one per island). Simplify
   (Douglas–Peucker, tolerance from `detail`).
5. **Triangulate**: constrained Delaunay with interior Steiner points on a jittered
   grid sized from `detail` (use a library — `poly2tri` supports Steiner points;
   evaluate `cdt2d` too — do not hand-roll CDT). Drop degenerate triangles.
6. Store in character space with `key = hash(path data + visibility + viewBox + detail)`.
   The mesh only changes when the user rebuilds it in the studio (detail slider,
   path visibility changes ⇒ "Rebuild mesh" prompt). A stale key ⇒ render
   **without deformation** (never rebuild during render).

Islands each get their own mesh component; a component with **no pins stays still**
(implicit fixed constraint at its centroid) so the solver is never under-determined.

### 4.5 Deformation (`arap.ts`, `bind.ts`, `deform.ts`)

**Two-step as-rigid-as-possible** (Igarashi, Moscovich, Hughes 2005: similarity
step, then scale-adjustment step), solved in **character space**. Pins are **soft
constraints** at barycentric positions inside their triangle (weight ≈ 1e4), so the
system matrix depends only on mesh + pin *placement*, not on current pin positions.

- **Precompute** when mesh, pin set/placement or starch change: build and
  Cholesky-factor the step-1 (2N×2N) and step-2 (N×N, shared by x and y) matrices.
  Cache by `(mesh.key, pins' ids/at/kind/radius/amount)`. Dense is fine up to ~600
  vertices (detail slider max) — precompute < 1 s, per-frame solve sub-ms. Keep the
  solver behind a small interface so a sparse Cholesky can replace it later.
- **Per frame**: new right-hand side → two back-substitutions.
- **Starch**: scale edge weights inside the radius by `1 + amount·K` (K ≈ 20–50,
  tune visually) with smooth falloff, in both steps. Not a positional constraint.
- **Identity guarantee**: when every pin is at `at` (no pose, loops at rest), skip
  the solve and return the source geometry **exactly**.

**Binding** (`bind.ts`): normalise each path with `preparedSegments(d, maxLen)` from
`src/animation/wobble.ts` (subdivide long runs so straight edges can bend); map
anchors *and* control points local → character space with the path's `transform`;
find each point's triangle (uniform-grid acceleration) and barycentrics. Points
outside every triangle (stroke overhang, AA margin) bind to the **nearest**
triangle with extrapolated barycentrics. Cache per `(d, transform, mesh.key)`.

**Applying**: deformed point = barycentric combination of deformed vertices, mapped
back to path-local space with the inverse transform, written with
`displaceSegments` (control points move with anchors → smooth curves). Then the
instance's stretch to its box is the same per-path transform composition that
`svgPaths()` already does (viewBox → layer box). Gradients keep local geometry.

**Composition with path presets** (draw-on, wobble…, which also work on puppet
layers — extend `isPathLayer`): puppet deformation happens **before**
`applyPathFrames`, and wobble must compose in the **same** `displaceSegments` pass
over the *rest* segments (`p → wobble(deform(p))`) — otherwise wobble's cache,
keyed by `d`, thrashes every frame. Draw-on keeps using rest path lengths.

### 4.6 Pins over time (`pins.ts`, `pinPresets.ts`)

`evaluateLayer` (for `puppet` layers) produces `LayerFrame.pins: { id, x, y }[]` in
character space from the selected motion. Studio preview uses the same function
with the preview timeline. Evaluate **parent-first** (ignore a parent link that
would form a cycle):

```
base = motion.poses[id] ?? pin.pose ?? pin.at
if parent: pos = parentPos + rotate(base − parentBase, parentAngle + swing(t)); angle = parentAngle + swing(t)
else:      pos = base; angle = 0
pos += bob(t) + circle(t) + beatSquash(t)          (world-space offsets, summed)
```

Children inherit the parent's translation **and** rotation (FK chains); bob/circle
are screen-aligned. Starch pins have no animations.

| Preset | Params | Notes |
|---|---|---|
| `swing` | angle (±deg), wave (`sine` \| `beat`) | Rotation of the parent→pin link. Requires a parent; UI says so and offers a parent picker. |
| `bob` | direction (deg, default 90), distance px, wave (`sine` \| `beat`) | `beat` = fast attack, exponential decay (reuse the `pulse` curve). |
| `circle` | radius px, ellipse ratio, direction (cw/ccw) | |
| `beatSquash` | distance px, direction, sharpness | Dips each period and springs back; default period 1 beat. |

All periodic and exactly neutral at cycle 0 → seamless loops (ADR-0004). **Rest
state**: loops off, poses kept (so thumbnails show the base/motion pose).

**Phase offset** for every loop: `cycle = cycleOf(t + phaseOffset·period, period)`
in `evaluate.ts` and `pins.ts`; "Offset" control (0–1, step 0.05, "½" shortcut) on
loop rows everywhere.

### 4.7 UI

**Library area.** The gallery gains tabs **Posters | Characters** (`useUI.view`
gains `'studio'`; the gallery remembers its tab). Characters grid: thumbnail
(rest pose), name, motion count, duplicate/delete (delete shows usage). "New
character" → file picker → existing SVG import pipeline (sanitiser, warning dialog)
→ new asset → studio.

**Puppet studio** (`view: 'studio'`, own zustand+zundo store; autosave like posters):
- Header: back (to wherever the user came from), name, undo/redo.
- Centre: canvas showing the character on a neutral checkerboard, `PuppetOverlay`:
  mesh wireframe (toggle), pins (selected = accent ring; starch = dashed radius
  circle with drag handle), parent links. Click on the artwork adds a pin (inside
  the mesh only); Alt-click adds a starch pin; drag = set pose (in the selected
  motion: motion pose override; with "Base pose" selected: base pose); Delete
  removes the pin (and clears it as a parent). One drag = one undo step.
- Left panel: **Motions** list ("Base pose" + named motions; add, rename,
  duplicate, delete) and **Pins** list (rename, kind, parent).
- Right panel: mesh detail + rebuild; selected pin's settings and its loops in the
  selected motion (reuse `AnimationRow`/`ParamControls` from `AnimationSection.tsx`
  — extract shared pieces rather than duplicating); preview BPM/duration.
- Bottom: playback bar + timeline with one lane per animated pin (reuse/extract
  ruler, playhead and lane components from `TimelinePanel.tsx`).

**In posters.**
- Toolbar **Characters** popover: library thumbnails; click places an instance at
  natural size (scaled to fit the artboard if larger) with the first motion selected.
- Inspector `PuppetLayerSection`: motion select (incl. "None — still"), colour
  swatches with per-instance overrides + reset, **Edit in studio**, **Detach** /
  **Re-link**, linked status ("Updated from library" / "Detached").
- **Open in puppet studio** on `svg` and `shape` layers: creates an asset from the
  layer's paths (natural size = layer size), replaces the layer with an instance at
  the same box keeping the layer's id-independent props (name, position, rotation,
  opacity, blend, layer animations) — one undo step — saves the poster, opens the studio.
- LayersPanel icon for `puppet`; timeline panel shows the instance's motion as one
  loop lane ("Dance · character motion").

---

## 5. Phases

### Phase 0 — Groundwork + phase offset

1. Types (§4.2), `normalizeDoc` for `puppet` layers (missing fields → defaults),
   asset normaliser, ADR-0012 "Puppet deformation: mesh-based ARAP with pins"
   (rejected: bend regions, rigid cut parts, distance-weighted points, full bones),
   ADR-0013 "Character library: linked instances with snapshots" (rejected: inline
   rigging on poster layers, copy-on-place).
2. `phaseOffset` on loops: evaluator, Inspector "Offset" control, tests (0 =
   unchanged; 0.5 = half a period later; still seamless).

**Checkpoint 0:** old posters hash identically (canvas + export); two layers with the
same pulse loop and offsets 0 / 0.5 alternate on the beat.

### Phase 1 — Library, studio shell, linked instances (no deformation yet)

1. Server `/api/assets` routes + client API + `useLibrary`.
2. Gallery tabs, Characters grid, new character from SVG, delete with usage.
3. Studio view shell: canvas with the character, motions/pins panels (empty
   lists OK), autosave + thumbnails, undo, back navigation.
4. `puppet` layer type in every `switch` (`LayerNode`, `renderScene`, `Inspector`,
   `LayersPanel`, `createLayer`); renders the snapshot's source paths with colour
   overrides; Toolbar Characters popover; `PuppetLayerSection` (motion select can
   be empty for now); Open in puppet studio from svg/shape layers; snapshot refresh;
   detach / re-link.
5. Tests: snapshot refresh logic (pure part), colour override application, asset
   normaliser, svg/shape → asset conversion (geometry identical).

**Checkpoint 1:** turn the Poster 5 taco into a character via "Open in puppet
studio" — the poster looks pixel-identical before/after; place the taco in a second
poster; rename/recolour in the studio and both posters update on open; detach one
and it stops updating; delete the character and both posters still render.

### Phase 2 — Silhouette + mesh (studio)

1. `silhouette.ts`, `mesh.ts` (+ library), detail slider, rebuild, wireframe toggle.
2. Unit tests on synthetic masks: filled square → one island, triangles inside,
   area ≈ square; ring → hole filled; two bars 3 px apart → two islands, no shared
   edge; detail controls triangle count within ±25%; no degenerate triangles.

**Checkpoint 2:** meshes for every fixture in `test/fixtures/svg/`, the taco and 3
library shapes look right; the taco's legs are **not** connected; build time logged
(target < 300 ms for the taco at default detail).

### Phase 3 — Solver, binding, posing (the core)

1. `arap.ts`, `bind.ts`, `deform.ts`; hooked into the path pipeline for `puppet`
   layers (canvas + export) and the studio canvas.
2. Studio pin editing: add / select / drag (pose) / delete, starch pins with radius
   handle, base pose vs motion poses, reset pose.
3. Unit tests: identity guarantee (byte-identical `d`); all pins translated by v →
   every vertex translated by v; rigid rotation of all pins → rigid mesh rotation
   (within tolerance); starch reduces edge-length change inside its radius; island
   without pins stays still; binding round-trip (undeformed → original points within 1e-6).

**Checkpoint 3:** in the studio, pose the taco: drag the hand down — the arm bends
smoothly, body and other limbs stay put (pins on body/feet), legs don't pull each
other; starch keeps the hat rigid while the head tilts; the pose shows in every
linked poster; instance live == export (0 px); one drag = one undo step; per-frame
deform time on the taco logged.

### Phase 4 — Motions, pin animation, chains

1. `pins.ts` (FK order, cycle guard), `pinPresets.ts`, evaluator integration for
   `puppet` layers (poster BPM) and studio preview (preview BPM), rest state.
2. Studio: named motions, pin loops UI (shared rows/controls, phase offset, parent
   picker, "Swing needs a parent pin" hint), studio timeline lanes, playback.
3. Poster: motion select works; timeline panel shows the motion lane.
4. Tests: every pin preset neutral at cycle 0 and periodic; child follows parent's
   translation and rotation; cycle guard; rest state = pose; beat-unit motions
   rescale with poster BPM.

**Checkpoint 4:** build a "Dance" motion on the taco (arms swing in alternation with
offset ½, feet kick, body bobs via `beatSquash`) and an "Idle" motion; place it in a
120 BPM and a 90 BPM poster — both on-beat; export MP4s: first and last frames
identical; live == export at 6 times.

### Phase 5 — Performance & polish

1. Profile a 1,000+ path SVG character with motion + wobble; ensure binding,
   prepared-segment and factorisation caches hit; report per-frame ms and fps.
2. Stale-mesh banner; pins outside a rebuilt mesh flagged in the pin list.
3. README section; ADR updates.

**Checkpoint 5:** the dancing taco plays smoothly in a poster (report fps), an old
poster and every Phase-4 path preset still render identically.

---

## 6. Risks & gotchas (checklist for the implementer)

- [ ] Render/export use **only the snapshot** — never fetch during render.
- [ ] Snapshot refresh is **not** an undo step (zundo pause/resume).
- [ ] The mesh is **stored**, never rebuilt during render; stale key ⇒ no deformation + banner.
- [ ] Pins at rest ⇒ geometry **exactly** unchanged.
- [ ] Pins are soft constraints at barycentric positions ⇒ factorisation independent of pin *positions*.
- [ ] Solver never under-determined: islands without pins get an implicit fixed point.
- [ ] Solve in character space; instance resizing is just the existing per-path stretch.
- [ ] Wobble + puppet in **one** displacement pass on rest segments.
- [ ] Deform in character space; path transforms map in and back out (gradients stay local).
- [ ] Studio has its own undo history; switching views doesn't mix histories.
- [ ] Everything deterministic in `t` (ADR-0004); loops seamless with phase offsets.
- [ ] Old posters unchanged; new layer type added to every `switch`.

## 7. Industry reference (for context)

| Tool | Equivalent |
|---|---|
| After Effects Puppet tool | Mesh from alpha outline, position/starch pins, ARAP-style deformation. Our deformation model. |
| After Effects precomps | Build once, reuse in many comps, edits propagate. Our linking model. |
| Rive | Character on its own artboard with named animations; nested into other artboards, choosing the animation. Our motions model. |
| Figma components | Main + instances with overrides (our colour overrides) and detach. |
| Character Animator | Puppets rigged in their own workspace and reused across scenes. |

## 8. Implementation notes

**Phase 0**
- Built: `phaseOffset` on every loop (`loopTime()` in `timing.ts` shifts time by `offset·period` before the cycle
  and the preset see it, so noise/boil presets shift too and loops stay seamless); Inspector "Offset" slider (0–0.95)
  with a "½" toggle; the timeline panel's loop ticks follow the offset. Character/puppet types in
  `src/puppet/types.ts`; `normalizeAsset` (+ tests); ADR-0012, ADR-0013. 15 new tests (276 total).
- Deviation: `PuppetLayer` is defined but **not yet in the `Layer` union** — adding it forces every
  `switch (layer.type)` to handle it, which is Phase 1 work. It extends `Omit<BaseLayer, 'type'>` until then.
  `normalizeDoc` handling for `puppet` layers moves to Phase 1 with it.
- Verified: all 5 saved posters hash identically to the previous commit (4 times × animated/rest = 40 renders);
  in the app, two beat pulses with offsets 0 / ½ at 120 BPM alternate (rect peaks at 0s/1s, ellipse at 0.5s,
  measured from exported frames) and frame 4s == frame 0s.

**Phase 1**
- Built: `/api/assets` (posters and assets now share one `mountCollection` helper in `server/fileApi.ts`) +
  `/api/assets/:id/usage`; client `src/library/` (API + snapshot sync); `puppet` layer type in every switch,
  rendered through the existing viewBox → box path pipeline (`getLayerPaths`), so path presets (draw-on, wobble…)
  work on characters too; per-instance colour overrides (`remapSwatches`, no cascading); gallery tabs
  Posters | Characters with a Library grid (new from SVG with the warning dialog minus "flat image", duplicate,
  delete with usage list); puppet studio shell (own zundo store, autosave + thumbnail, undo/redo, motions list with
  add/rename/delete, empty pins list, colour palette, light/dark checkerboard); toolbar Characters popover;
  Inspector `PuppetLayerSection` (motion select, colour overrides + reset, Edit in studio, Detach / Re-link) and
  "Open in puppet studio" on SVG and shape layers. 16 new tests (292 total).
- Decisions while building:
  - `version` is a revision stamp changed on every studio edit (`max(now, prev+1)`); instances refresh when it
    **differs**, not only when larger, so undoing in the studio propagates as well.
  - Converting keeps the layer's **id** (selection and timeline rows stay stable) and its layer animations.
  - Library thumbnails render through the poster renderer (`previewInstance`) so they match instances exactly.
  - Studio/library/menu backdrops are a light checkerboard by default — black line art was invisible on dark.
- **Pre-existing bug fixed:** the poster undo history was never cleared when opening another poster, so ⌘Z right
  after opening one could restore the *previous* poster's doc, which autosave would then write back to that poster's
  file. `loadDoc`/`newDoc`/`closeDoc` now clear history (tests in `src/store/editor.test.ts`).
- Verified in the app (on a copy of Poster 5 and a scratch poster, both deleted afterwards): "Open in puppet studio"
  on the taco → poster renders **pixel-identical** (hashes at t=0 and 1.3 equal the pre-conversion baseline); placed
  in a second poster via the toolbar; rename + recolour + new "Dance" motion in the studio reached the poster on return
  and the other poster on open, without adding undo steps; detached instance kept its old colour while the linked one
  updated; delete warned "Used in 2 posters" and both posters still render (now detached); new character from
  `08-unsupported.svg` shows the warnings in dialog and studio. Saved posters: 37/40 renders identical to Phase 0;
  the 3 differences are Poster 5 at t>0, which the user edited after Phase 0 (a sway loop with offset ½).

## 9. Progress

- [x] Phase 0 — Groundwork + phase offset (done; awaiting user review)
- [x] Phase 1 — Library, studio shell, linked instances (done; awaiting user review)
- [ ] Phase 2 — Silhouette + mesh
- [ ] Phase 3 — Solver, binding, posing
- [ ] Phase 4 — Motions, pin animation, chains
- [ ] Phase 5 — Performance & polish
