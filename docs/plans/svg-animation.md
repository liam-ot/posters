# Plan: SVG layers, shape library & animation presets (v1)

> **For the implementing agent:** work through the phases **in order**. At the end
> of every phase: run `pnpm typecheck` (and `pnpm test` once Phase 0 adds it),
> verify in the running app (`.claude/launch.json` → `poster-studio`), tick the
> phase's checklist in this file, then **stop and report to the user**. Do not
> start the next phase until the user confirms. Match the existing code style:
> small focused modules, terse comments explaining *why*, Tailwind with the
> `var(--color-*)` tokens, zustand + immer for state, Radix for popovers/dialogs.

---

## 1. Goal

Today only generator layers animate (pure functions of `(layer, t)`); SVGs can
only be imported as flat raster images. v1 adds:

1. **Animation presets on every layer** — entrance (in), exit (out) and loop
   animations, usable alone or combined, with an optional poster **BPM** so loops
   can lock to the music.
2. **Vector SVG import** — uploaded SVGs become editable vector layers (per-path
   list + Canva-style colour swatches), with a warning for anything skipped.
3. **Parametric shape library** — stars, polygons, bursts, arrows, squiggles,
   spirals… with sliders.
4. **Path-level effects** for SVG and shape layers — draw-on with stagger,
   path fade with stagger, wobble (noise-displaced points), dash flow.
5. **Timeline panel** — per-layer animation bars, drag to retime, beat grid.

## 2. Decisions already made (do not re-litigate)

| Topic | Decision |
|---|---|
| Animation model | **Presets + procedural modifiers.** No keyframes in v1, but the engine must be keyframe-ready (see §4.3). |
| Timing | Each layer may have **at most one `in`, at most one `out`, and any number of `loop`** animations. All combinations valid. |
| Reach | Generic presets work on **all** layer types; path presets only on `svg` and `shape` layers. |
| Beat sync | Poster-level `bpm` + `beatsPerBar`. Loop periods can be in seconds, beats or bars. |
| Edit view | Canvas shows the **frame at the playhead**, plus a **"Show rest state"** toggle. |
| Still output | PNG/JPG export and gallery thumbnails use the **rest state** by default; export dialog offers "current frame". |
| SVG editing | One layer per SVG with a **path list** and **colour swatches**. No ungrouping. |
| SVG fidelity | Tier 1 (paths, shapes, groups, transforms, CSS/`<style>`, `<use>`/`<defs>`) + Tier 2 (linear/radial gradients). Tier 3 (`clipPath`, embedded `<image>`) is a **stretch goal** in Phase 3. Everything else: skipped + listed in a warning, with "Import as flat image instead". |
| Shape library | Geometric basics + lines/strokes, all **parametric** (sliders). |
| Text | Text animates as a whole block (no per-letter split in v1). |
| Schema | Keep `schemaVersion: 1`. All new fields are **optional**; add a `normalizeDoc()` on load. Old posters must open unchanged. |

## 3. Out of scope (future work — do not build)

- Keyframe tracks + keyframe editor (v2; engine is designed for it).
- Generated noise-driven blobs / organic shapes.
- Kinetic typography (per-letter/word/line split + stagger).
- Shape morphing; motion along a path; text on a path.
- SVG masks, filters (blur/shadow/etc.), patterns, markers, `<text>` as editable text.
  (Future idea: rasterise just the unsupported element via the browser and place it as an image.)
- SVG / Lottie export.
- Ungrouping SVGs into separate layers / layer groups.
- Blur-based presets (need Konva caching; too slow per frame).

---

## 4. Architecture

### 4.1 Current state (read before starting)

- Live canvas: `src/canvas/LayerNode.tsx` (react-konva). Export: `src/export/renderScene.ts`
  (imperative Konva). **These duplicate each layer's drawing logic** — Phase 0 fixes this.
- Time: `src/store/timeline.ts` (`time`, `playing`); clock in `src/ui/TimelineBar.tsx`.
- Generators subscribe to time in `src/canvas/GeneratorContent.tsx` only when `animated`.
- MP4 export renders each frame deterministically via `renderSceneToCanvas(doc, t, scale)`.
  **Every animation must be a pure function of `t`** — no wall-clock, no CSS/SMIL, no
  `Math.random()` at render time (use seeded noise).
- Thumbnails currently capture the live stage (`captureStageDataURL`) in
  `src/hooks/useAutosave.ts` and `src/ui/Editor.tsx` (`back`).
- Every `switch (layer.type)` must be extended for new types: `LayerNode.tsx`,
  `renderScene.ts`, `Inspector.tsx` (`TypeSection`), `LayersPanel.tsx` (`LayerIcon`),
  `lib/layers.ts` (`createLayer`).

### 4.2 Shared render description (Phase 0)

Introduce `src/render/` holding **pure functions that return Konva node configs**
(plain objects). Both renderers consume them:

```ts
// live:   <Rect {...rectConfig(layer)} />
// export: new Konva.Rect(rectConfig(layer))
```

Each layer type gets a config builder (`rectConfig`, `ellipseConfig`, `textConfig`,
`borderConfig`, …). Paths (Phase 2+) get `pathNodeConfigs(layer, frame) → PathConfig[]`
that both sides map over. Rule going forward: **no drawing decision lives in only one renderer.**

### 4.3 Animation engine (keyframe-ready)

Presets don't touch Konva. They are **channel sources**: given a layer, time and context,
they output values for named channels. The evaluator merges all sources into a
`LayerFrame`. A future `KeyframeTrack` will simply be another channel source.

```ts
// src/animation/types.ts (or extend src/types/poster.ts)
type AnimationPhase = 'in' | 'out' | 'loop'
type TimeUnit = 'sec' | 'beat' | 'bar'
type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
                | 'backOut' | 'elasticOut' | 'bounceOut'

interface LayerAnimation {
  id: string
  preset: AnimationPresetId
  phase: AnimationPhase
  enabled: boolean
  // in:   starts at `delay` seconds after 0
  // out:  ends `endOffset` seconds before the timeline end (stays anchored if duration changes)
  // loop: runs for the whole timeline; `period` in `periodUnit`
  delay?: number
  endOffset?: number
  duration?: number          // in/out, seconds
  period?: number            // loop
  periodUnit?: TimeUnit      // loop
  easing: EasingName
  params: Record<string, number | string | boolean>
}

// BaseLayer gains:  animations?: LayerAnimation[]
// TimelineConfig gains:  bpm?: number; beatsPerBar?: number  (default 4)
```

```ts
// Output of evaluation — the "channels"
interface LayerFrame {
  dx: number; dy: number          // additive, px
  rotation: number                // additive, degrees
  scaleX: number; scaleY: number  // multiplicative
  opacity: number                 // multiplicative
  paths?: PathFrame[]             // only for svg/shape layers with path presets
}
interface PathFrame {
  draw: number          // 0..1 stroke reveal (1 = fully drawn)
  opacity: number       // multiplicative
  fillOpacity: number   // multiplicative (draw-on "fill after")
  dashOffset: number    // dash flow
  wobble?: { amount: number; scale: number; t: number; seed: number }
}

evaluateLayer(layer, t, ctx: { duration, bpm, beatsPerBar, rest: boolean }): LayerFrame
```

**Composition rules:** translate and rotation add; scale and opacity multiply;
`draw` takes the min of in/out contributions. **Out presets are the in-curve
reversed** (`value(1 - easedProgress)`), so each preset only defines one curve.

**Rest state** (`ctx.rest = true`): `in` progress = 1, `out` progress = 0, loops at
their neutral value (identity). This is what thumbnails and default still exports use.

**Preset registry** (`src/animation/presets.ts`), mirroring `src/generators/config.ts`:

```ts
interface AnimationPresetDef {
  id: AnimationPresetId
  label: string
  phases: AnimationPhase[]            // which phases it can be added as
  appliesTo: 'all' | 'paths'          // 'paths' = svg + shape layers only
  defaults: Record<string, ParamValue>
  controls: ParamControl[]            // reuse ParamControl from generators/config.ts
  defaultEasing: EasingName
  // progress: 0..1 for in/out (already eased), cycle phase 0..1 for loops
  apply(frame: LayerFrame, p: number, params, layer, ctx): void
}
```

### 4.4 Applying a frame without corrupting the document

**Critical:** the Transformer is attached to each layer's outer `<Group>` and writes
its position/size back to the doc on drag/transform end. Animated values must
therefore go on a **new inner Group**, never the outer one, or animation offsets get
baked into the document.

```
Outer Group  (id, x, y, rotation, opacity, blend — unchanged, drives Transformer)
└─ Inner Group  x = w/2 + dx, y = h/2 + dy, offset = (w/2, h/2),
   │            rotation, scaleX/Y, opacity      ← from LayerFrame
   └─ content (rect / text / image / generator / paths)
```

Scale and rotate pivot around the layer centre via the offset. Build this as
`animatedGroupConfig(layer, frame)` in `src/render/` and use it in both renderers.

Live canvas: only layers with ≥1 enabled animation subscribe to `useTimeline().time`
(same pattern as `GeneratorContent`), so static layers don't re-render per frame.

### 4.5 Seamless loops

Posters loop. To keep MP4s seamless:
- Periodic presets use `cycle = (t / periodSec) % 1`. Seamless only when the period
  divides the timeline duration — Inspector shows a hint when it doesn't. With BPM
  set, offer a "Fit duration to N bars" action.
- Noise-based presets (jitter, wobble) sample **4D simplex noise on a circle**
  (`noise4D(x, y, R·cos(2πt/D), R·sin(2πt/D))`, `createNoise4D` from `simplex-noise`),
  so frame `D` equals frame `0` exactly.
- Optional `step` param on jitter/wobble: quantise time to N updates per second or per
  beat (`t' = floor(t·rate)/rate`) for a hand-drawn "boil" look.

### 4.6 New layer types

```ts
type Paint =
  | { type: 'solid'; color: string }   // rgba/hex, includes fill-/stroke-opacity
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: Stop[] }
  | { type: 'radial'; cx: number; cy: number; r: number; fx: number; fy: number; stops: Stop[] }
interface Stop { offset: number; color: string }   // stop-opacity folded into color

interface VectorPath {
  id: string
  name?: string                 // from id/class/inkscape:label if present
  d: string                     // path data in the path's local space
  transform: [number, number, number, number, number, number] // local → viewBox space
  fill: Paint | null
  stroke: Paint | null
  strokeWidth: number
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
  miterLimit: number
  dash?: number[]
  fillRule: 'nonzero' | 'evenodd'
  opacity: number               // includes multiplied ancestor group opacity
  visible: boolean
}

interface SvgLayer extends BaseLayer {
  type: 'svg'
  viewBox: { x: number; y: number; width: number; height: number }
  paths: VectorPath[]
  sourceSvg: string             // sanitised source, for "reset colours" / "flat image"
  importWarnings?: string[]
}

type ShapeKind = 'star' | 'polygon' | 'triangle' | 'burst' | 'ring' | 'arrow' | 'cross'
               | 'squiggle' | 'zigzag' | 'wave' | 'spiral' | 'swoosh'

interface ShapeLayer extends BaseLayer {
  type: 'shape'
  shape: ShapeKind
  params: Record<string, number | string | boolean>
  fill: string | null
  stroke: string | null
  strokeWidth?: number
  strokeStyle?: StrokeStyle
  lineCap?: 'butt' | 'round' | 'square'
}
```

- **Transforms stay per path** (not baked into `d`) so gradients remain exact. Decompose
  the matrix into Konva `x, y, rotation, scaleX, scaleY, skewX` (write a small
  `decomposeMatrix` helper; any 2D affine decomposes into these).
- **SVG scaling:** the paths group is scaled by `width / viewBox.width`, `height / viewBox.height`
  (stretch, like `preserveAspectRatio="none"`; Shift-resize keeps the ratio). Strokes scale with it, as in SVG.
- **Shape layers generate geometry at the layer's real width/height** (no viewBox scaling)
  so stroke widths stay true pixels. Paths are derived at render time from
  `(shape, params, width, height)` via a pure, memoised `generateShape()`.
- Both types feed one path pipeline: `getLayerPaths(layer) → VectorPath[]`
  (`src/render/paths.ts`). Draw-on, wobble etc. only ever see `VectorPath[]`.
- Render every path with **`Konva.Path`** (`data`, fill/stroke/gradient props, `dash`,
  `dashOffset`, `fillRule` — confirm Konva 10 supports `fillRule` on Path; if not, use a
  custom `Konva.Shape` `sceneFunc` calling `ctx.fill('evenodd')`).

---

## 5. Phases

### Phase 0 — Groundwork (no visible change)

1. Recommend to the user (do not do it yourself) that they `git init` and commit before
   starting, so each phase can be reviewed and reverted.
2. Add `vitest` as a dev dependency, a `test` script, and tests next to pure modules
   (`*.test.ts`). Only pure logic gets unit tests (easing, evaluator, timing, shape
   generators, matrix maths, colour normalisation). DOM-heavy code is verified in the app.
3. Create `src/render/configs.ts` with config builders for rect, ellipse, text, image,
   border and generator image. Rewrite `LayerNode.tsx` and `renderScene.ts` to use them.
   Behaviour must stay identical.
4. Add `normalizeDoc(doc)` (fills optional defaults) and call it wherever a doc is loaded
   (`loadDoc` in `src/store/editor.ts`).

**Checkpoint 0:** existing posters in `data/posters/` look identical on the canvas and in a
PNG export compared with before; typecheck + tests pass.

### Phase 1 — Animation engine + generic presets

Files: `src/animation/{easing,timing,noise,presets,evaluate}.ts`, `src/render/transform.ts`,
`src/ui/AnimationSection.tsx`, plus edits to `poster.ts`, `LayerNode.tsx`, `renderScene.ts`,
`Inspector.tsx`, `TimelineBar.tsx`, `ExportDialog.tsx`, `store/ui.ts`, `useAutosave.ts`, `Editor.tsx`.

1. Types from §4.3. Easing functions (the 7 names). Timing helpers: convert
   beat/bar → seconds, absolute window for in/out (`delay`, `endOffset`), loop cycle.
2. Generic presets (`appliesTo: 'all'`):

   | Preset | Phases | Params |
   |---|---|---|
   | `fade` | in, out | — |
   | `slide` | in, out | direction (up/down/left/right), distance px |
   | `scale` | in, out | from scale (default 0; use `backOut` easing for a "pop") |
   | `rotate` | in, out | degrees |
   | `pulse` | loop | amount, shape (`sine` \| `beat` = fast attack, exponential decay) |
   | `float` | loop | distance, axis (x/y) |
   | `spin` | loop | revolutions per period, direction |
   | `sway` | loop | degrees |
   | `jitter` | loop | position amount, rotation amount, step rate (0 = smooth) |
   | `blink` | loop | min opacity, duty cycle |

3. `evaluateLayer` + composition rules + rest state (§4.3). Unit-test it thoroughly:
   rest state is identity for every preset; frame at `t=0` equals frame at `t=duration`
   for every loop preset when the period divides the duration; out mirrors in.
4. Inner animated Group in both renderers (§4.4). `renderSceneToCanvas` gains an option
   `{ rest?: boolean }`.
5. `useUI` gains `showRest: boolean`. A toggle button in the TimelineBar (eye/"rest" icon).
   When on, the canvas evaluates with `rest: true`. Playing turns it off automatically.
6. TimelineBar: BPM number input (empty = off) and beats-per-bar.
7. Inspector `AnimationSection` (for every layer type, below Appearance):
   - three groups: **In**, **Loop**, **Out**. "+" per group opens a menu of presets valid
     for that phase and layer type. In/Out "+" is disabled once one exists.
   - each animation: collapsible row with preset name, enable toggle, delete; timing
     fields (delay/duration, endOffset/duration, or period + unit selector, where beat/bar
     is disabled without BPM); easing select; preset params rendered from `controls`
     (extract the param-control rendering from `GeneratorSection` into a shared component).
   - seamless-loop hint (§4.5).
8. Still output: export dialog gets "Rest state / Current frame" (default rest). Thumbnails
   switch from `captureStageDataURL` to `renderSceneToCanvas(doc, 0, ratio, { rest: true })`
   in `useAutosave.ts` and `Editor.tsx`.
9. Undo: edits through `updateLayer` as usual. Numeric fields already commit per change;
   keep it that way.

**Checkpoint 1:** a text layer with slide-in + pulse loop + fade-out plays in the editor and
exports to MP4 identically; the rest toggle shows the final layout; transforming a layer
mid-animation doesn't bake offsets into its x/y; old posters unaffected; thumbnails show rest state.

### Phase 2 — Path rendering + shape library

Files: `src/shapes/library.ts`, `src/render/paths.ts`, `src/canvas/PathsContent.tsx`,
`src/ui/ShapeLibraryMenu.tsx`, `src/ui/ShapeSection.tsx`, plus switch-case updates (§4.1).

1. `ShapeLayer` type, `createLayer('shape', …, { shape })` with sensible defaults
   (closed shapes: fill colour, no stroke; line shapes: no fill, stroke 8px, round caps).
2. `generateShape(kind, params, w, h) → VectorPath[]`, pure and unit-tested (valid `d`,
   fits within `w×h`). Kinds and params:

   | Kind | Params |
   |---|---|
   | star | points, inner radius % |
   | polygon | sides, corner rounding |
   | triangle | apex position % |
   | burst | points, inner radius %, jaggedness (seeded) |
   | ring | thickness % (even-odd) |
   | arrow | shaft thickness %, head length %, head width % |
   | cross | arm thickness % |
   | squiggle | waves, amplitude %, smoothness |
   | zigzag | peaks, amplitude % |
   | wave | cycles, amplitude %, phase |
   | spiral | turns, inner radius % |
   | swoosh | curvature, taper on/off |

   Use the same `ParamControl` format as generators so the Inspector renders them generically.
3. `getLayerPaths(layer)` + `pathNodeConfigs(...)` in `src/render/paths.ts`; `PathsContent`
   (live) and the `renderScene` branch both map over these configs.
4. Toolbar: "Shapes" button opening a popover grid (lucide icons or small inline previews
   generated by `generateShape`).
5. Inspector `ShapeSection`: kind params + fill/stroke/width/style/caps. Generic
   animations from Phase 1 work automatically.
6. LayersPanel icon for `shape`.

**Checkpoint 2:** every library shape can be added, tweaked with sliders, resized (strokes stay
at the set px width after release), animated with generic presets, and exported identically.

### Phase 3 — SVG import

Files: `src/svg/{sanitize,parse,paint,matrix,color}.ts`, `src/ui/SvgImportDialog.tsx`,
`src/ui/SvgSection.tsx`, plus Toolbar/switch-case updates. Add dependency **`svgpath`**
(normalising/converting path data).

1. **Entry:** the Image button's file input: if `file.type === 'image/svg+xml'` or the name ends
   in `.svg`, go through SVG import instead of the raster path. (Also accept `.svg` explicitly in `accept`.)
2. **Sanitise first** (`sanitize.ts`), before anything touches the live DOM: remove `<script>`,
   `<foreignObject>`, every `on*` attribute, and any `href`/`xlink:href` not starting with `#`
   (except `data:image/*` on `<image>`, kept only for the Tier 3 stretch).
3. **Parse using the browser** (`parse.ts`) instead of re-implementing CSS:
   - `DOMParser` → mount the `<svg>` in a hidden container (`position:absolute; visibility:hidden;
     pointer-events:none` — **not** `display:none`, which breaks `getScreenCTM`). Always remove it afterwards.
   - Expand `<use>` in place (clone the referenced element into a `<g>` carrying the use's
     `x/y` translate and transform; recursive with a cycle guard). Treat `<symbol>` as `<g>`.
   - Insert a marker `<g/>` as a direct child of the root. For each shape element:
     `matrix = inverse(marker.getScreenCTM()) × el.getScreenCTM()` = local → viewBox space.
   - Read resolved styles from `getComputedStyle(el)`: fill, stroke, stroke-width, opacity,
     fill-opacity, stroke-opacity, fill-rule, stroke-linecap/linejoin/miterlimit/dasharray,
     display, visibility. Opacity is not inherited in computed style: multiply ancestor `<g>`
     opacities manually (known approximation for overlapping children — document in a comment).
   - Convert `rect` (incl. rx/ry), `circle`, `ellipse`, `line`, `polyline`, `polygon` to `d`; keep `path` as is.
   - Missing `viewBox`: derive from width/height, else from `getBBox()`.
   - Colour normalisation (`color.ts`): computed `rgb()/rgba()` → `#rrggbb` / `#rrggbbaa`, used
     for palette de-duplication. Unit-test.
4. **Gradients** (`paint.ts`): resolve `url(#id)` (follow `href` inheritance between gradients).
   Linear → Konva `fillLinearGradientStartPoint/EndPoint/ColorStops`; radial → `fillRadialGradient*`
   with start = focal point (radius 0), end = centre (radius r). `objectBoundingBox` units: convert using
   the path's local bbox (`new Konva.Path({ data }).getSelfRect()`). `gradientTransform`: apply to the
   endpoints; if it has skew or non-uniform scale on a radial gradient, approximate (mean radius) and
   add a warning. `spreadMethod` reflect/repeat → treat as pad + warning. Same for stroke paints.
5. **Unsupported → warnings** (collected as a de-duplicated list with counts): `filter`, `mask`,
   `pattern` fills, `<text>`, `marker-*`, SMIL `<animate*>`/`<set>`, and — unless the stretch is
   done — `clip-path` and `<image>`. More than 1,000 paths → warning about performance.
6. **Stretch (Tier 3):** `clip-path` via a Konva Group `clipFunc` drawing the clip paths; `<image>` with
   `data:` href as a `Konva.Image`. Only if Phases 1–3 are otherwise solid; ask the user first.
7. **Import dialog** (only when there are warnings): "Imported N paths. Skipped: 2× filter, 1× mask…"
   with **Keep vector** / **Use flat image instead** (creates an `image` layer from the sanitised SVG
   as a data URL — today's behaviour).
8. **Inspector `SvgSection`:**
   - **Colours:** swatches for every unique colour (solid fills, strokes and gradient stops). Editing a
     swatch replaces that colour everywhere in the layer. **Reset colours** re-parses `sourceSvg`.
   - **Paths:** scrollable list (name or "Path n"), visibility toggle, fill/stroke swatch, stroke
     width. Hovering a row highlights the path on canvas (draw an outline overlay; nice-to-have).
9. LayersPanel icon for `svg`.

**Fixtures:** create `test/fixtures/svg/` with hand-written test files and check each in the app:
simple icon; Illustrator-style export using `<style>` classes; nested `<g transform>`s; `<use>`/`<defs>`;
even-odd ring; linear + radial gradient logo (incl. `objectBoundingBox` and `gradientTransform`);
`currentColor`; one file containing filter + mask + text + image (must import with warnings);
one malicious file with `<script>` and `onload` (must not execute).

**Checkpoint 3:** each fixture renders matching the browser's own rendering of the file (open the
.svg in a tab and compare); colours and paths are editable; export matches the canvas; no script runs.

### Phase 4 — Path-level animation presets

Files: `src/animation/pathPresets.ts`, edits to `evaluate.ts`, `src/render/paths.ts`.

All `appliesTo: 'paths'`. They fill `LayerFrame.paths[]`.

| Preset | Phases | Behaviour / params |
|---|---|---|
| `drawOn` | in, out | Stroke reveal via `dash = [L, L]`, `dashOffset = L·(1 − draw)`. Params: **stagger** 0–1 (0 = all together, 1 = strictly one after another), **order** (document / reverse / random(seed) / left→right / top→bottom by bbox), **fill** (`with` = fades in alongside / `after` = fades in after the stroke / `none`), **outline fills** toggle + outline width (fill-only paths are temporarily stroked in their fill colour so draw-on works on typical logos). |
| `pathFade` | in, out | Per-path opacity with stagger + order; optional rise distance (px, per-path offset). |
| `wobble` | loop | Noise-displaced points. Params: amount (px), scale (noise frequency), detail (subdivide long segments), step rate (0 = smooth; else "boil"). Uses looping 4D noise (§4.5). |
| `dashFlow` | loop | Marching dash offset along strokes. Params: dash length, gap, direction. |

Implementation notes:
- **Path length:** `new Konva.Path({ data: d }).getLength()`, cached in a `Map<string, number>` keyed by `d`.
- **Stagger window:** with `n` paths and stagger `s`, path `i` (after ordering) animates over
  `[i·s·(1−w)/…]` — derive so the whole sequence still fits the animation's duration. Unit-test that
  the first path starts at 0 and the last ends at 1.
- **Wobble:** normalise once with `svgpath(d).abs().unarc().unshort()`, convert to cubic segments,
  optionally subdivide, cache per `d`. Per frame, displace each anchor by noise sampled at the anchor,
  and move its control points by the same vector (keeps curves smooth). Emit a new `d` string. If perf
  is poor on complex SVGs, switch to a custom `Konva.Shape` `sceneFunc` drawing the segments directly.
- Where draw-on and an existing user `dash` conflict, draw-on wins while animating; at rest the user dash shows.

**Checkpoint 4:** a library squiggle draws on with fill "none"; an imported filled logo draws on with
outline fills + fill after, staggered left→right; wobble loops seamlessly in an exported MP4 (first
and last frame identical); all of it renders identically in export.

### Phase 5 — Timeline panel

Files: `src/ui/TimelinePanel.tsx`, edits to `TimelineBar.tsx`, `Editor.tsx`.

1. Expand/collapse toggle on the TimelineBar opens a panel above it (resizable height, collapsed by default).
2. Time ruler with seconds; when BPM is set, beat ticks and stronger bar lines.
3. One row per layer that has animations (top layer first, click selects the layer). Bars:
   **in** = solid bar from `delay` to `delay + duration`; **out** = solid bar ending at
   `duration − endOffset`; **loop** = striped bar across the full row with period ticks.
4. Drag the bar body to move, drag edges to change duration. Snaps to beats when BPM is set (hold
   Alt to disable). Update **local state while dragging and commit once on pointer-up**, so one drag
   = one undo step.
5. Clicking the ruler scrubs; the playhead line spans all rows.
6. "Fit duration to bars" action when BPM is set.

**Checkpoint 5:** retiming by drag feels right, undo works per drag, beat snapping works, and
playback/export reflect the changes.

---

## 6. Risks & gotchas (checklist for the implementer)

- [ ] Animated values only on the **inner** group (§4.4) — never baked into the doc by the Transformer.
- [ ] Every new drawing decision goes through `src/render/` so live and export can't diverge.
- [ ] Everything is deterministic in `t`. Seeded randomness only.
- [ ] Loops seamless at `t = duration` (period hint + circular 4D noise).
- [ ] SVG sanitised **before** mounting into the DOM; hidden container is removed afterwards, even on error.
- [ ] `getScreenCTM` needs a rendered (not `display:none`) element.
- [ ] Old posters open unchanged (no `animations` field ⇒ no inner-group behaviour change).
- [ ] Performance: only animated layers subscribe to time; path-length and normalised-path caches;
      warn above 1,000 paths.
- [ ] New `LayerType`s added to every `switch` (§4.1); `noFallthroughCasesInSwitch` will help.
- [ ] Generator `animated` flag keeps working exactly as before (separate concept; unify in v2).

## 7. Progress

- [ ] Phase 0 — Groundwork
- [ ] Phase 1 — Animation engine + generic presets
- [ ] Phase 2 — Path rendering + shape library
- [ ] Phase 3 — SVG import (stretch: clipPath, embedded images)
- [ ] Phase 4 — Path-level animation presets
- [ ] Phase 5 — Timeline panel
