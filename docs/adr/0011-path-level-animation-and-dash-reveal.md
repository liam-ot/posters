# ADR-0011: Path-level animation and revealing dashed strokes

**Status:** Accepted

## Context

Phase 4 animates the individual paths of SVG and shape layers: draw-on, staggered fades, wobble and
marching dashes. Two questions were not obvious from the plan:

1. How does draw-on interact with a stroke that is *already* dashed or dotted? The plan said "draw-on wins while
   animating; at rest the user dash shows", which would draw a dotted spiral as a continuous line that turns into
   dots at the end. The user wanted a dotted spiral to draw in **dot by dot**.
2. Draw-on classically works by animating the dash pattern, and fill-only logos have no stroke to draw.

## Decision

**Per-path state.** Path presets don't touch Konva or layer geometry; like the Phase 1 presets they write into the
`LayerFrame`, here `frame.paths[]` (one `PathFrame` each: `draw`, `opacity`, `fillOpacity`, `rise`, `flow`,
`wobble`, outline). A pure `applyPathFrames` turns frames into the `VectorPath`s that are drawn, so the live canvas and
export share it (ADR-0002). Composition: `draw` takes the min of in/out, opacities multiply, `rise` adds, the
outline fades by max, `flow`/`wobble` last-one-wins. Measured facts the pure code needs (path length, centre) are
passed in as `PathInfo`; only `render/pathInfo.ts` touches Konva.

**Revealing a stroke** (`animation/dash.ts`). To show the first `R` units of a stroke of length `L` the dash array
is rebuilt, and the final frame returns the plain pattern so it is exactly the resting stroke:

- solid stroke: `[R, L+1]`;
- dashed/dotted stroke: the pattern is walked from its current phase and emitted up to `R`, then a gap longer than
  the path so the cycle can't restart. **Pop** mode shows a dash whole once the reveal reaches its start; **grow**
  clips the dash at `R`;
- a gap before the first dash becomes a **negative `dashOffset`** (canvas shifts the pattern forward; verified
  empirically, offset `-30` on `[10,200]` puts the first dash at 30–40), because a dash array must begin with a dash;
- synthesised zero-length dashes are never emitted — with round caps they draw stray dots — but zero-length dashes
  the pattern itself contains (dotted style) are kept: they *are* the dots.

This also makes **dash flow and draw-on compose**: flow supplies the pattern phase and the reveal respects it.
A property test checks, for many patterns/offsets/reveals, that the drawn stretches equal the resting pattern
clipped by the pop/grow rule.

**Fill-only paths** (typical logos) get a temporary outline in their own colour so there is something to draw. Its
width is multiplied by `1 - fill progress`, so it thins to nothing exactly as the fill arrives and the finished frame
is the artwork as authored (no pop when the outline is removed). With "fill after", the stroke takes the first 70% of
each path's window and the fill the last 30%.

**Stagger.** With `n` paths and stagger `s`, each path animates over `1/(1+(n-1)s)` of the animation, offset so the
first starts at 0 and the last ends at 1: `s = 0` is simultaneous, `s = 1` strictly sequential. Each path eases on
its own window. Orders: drawing order, reverse, left→right, top→bottom (by path centre), seeded random.

**Wobble** normalises path data with `svgpath` (`abs → unarc → unshort`), makes the closing edge explicit, splits long
segments (de Casteljau for curves) so straight edges can bend, then displaces every anchor *and control point* by a
looping noise field sampled in layer space (so the look doesn't depend on viewBox units; the amount is in layer px).
One shared field moves a whole logo coherently. A `step` rate quantises time for a hand-drawn "boil".

**Noise ties.** The 4D simplex noise from `simplex-noise` is discontinuous (~0.1%) at exact lattice points. A loop's
start (`w = 0`) and any point with a zero coordinate sit on one, so frame 0 differed slightly from its neighbours.
Loop noise now starts at an irrational phase and offset (see ADR-0004).

## Alternatives considered

| Option | Why not |
|---|---|
| Draw-on replaces the dash pattern while animating | Dotted shapes draw as a line, then snap to dots — the reported problem. |
| Per-dash visibility (one node per dot) | Thousands of nodes for a long dotted path; the dash array does it in one. |
| Clip the stroke with a moving mask | No exact mask for "first R units of a path" in Konva without per-frame geometry. |
| Stroke fill-only paths permanently | Changes the artwork at rest; the thinning outline ends at the authored look. |
| Wobble anchors only | Straight edges (rect sides) wouldn't bend; curves would look lumpy. |

## Consequences

- (+) The finished frame of every path animation is pixel-identical to the resting layer (checked on 5 SVGs × 4 animations).
- (+) Dots appear one at a time and never disappear (checked: 74-dot spiral, dot count monotonic).
- (+) Loops (wobble, boil, dash flow) end exactly where they begin in rendered pixels.
- (-) Layers with path animation rebuild their path configs every frame (layers without it are memoised). Fine for
  logos and shapes; a layer with a thousand paths *and* wobble will be heavy (wobble regenerates every path's data).
- (-) A dash array can get long (one entry pair per visible dash), recomputed per frame per path.
- (-) Wobble does not move the dash phase, so a wobbling dashed path's dashes stay evenly spaced along the *original*
  length (the path's length changes slightly as it bends).
- (-) The outline for draw-on is in layer px and approximated for non-uniform scaling (uses the geometric-mean scale).
