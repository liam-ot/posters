# ADR-0007: Vector data model: `svg` and `shape` layers share `VectorPath`

**Status:** Accepted

## Context

SVGs are currently imported as flat raster images, so paths, colours and strokes cannot be edited or animated. We also
want a built-in library of shapes (stars, squiggles, spirals...) with sliders.

## Decision

Two new layer types, one shared path pipeline:

- `svg`: `viewBox`, `paths: VectorPath[]`, `sourceSvg` (sanitised, for "reset colours" and "flat image"),
  `importWarnings`.
- `shape`: `shape` kind + `params`; geometry is **derived** at render time by a pure, memoised
  `generateShape(kind, params, w, h)`, which returns geometry only (`d` + fill rule). Style comes from the layer, and
  `getLayerPaths` assembles the `VectorPath`s.
- `VectorPath` holds `d`, a per-path `transform`, `fill`/`stroke` as `Paint` (solid, linear or radial gradient),
  stroke attributes, `fillRule`, `opacity`.
- `getLayerPaths(layer) -> VectorPath[]` feeds one renderer (`Konva.Path`); path-level animations only see `VectorPath[]`.

Specific choices:

- **Transforms stay per path** (not baked into `d`) so gradients remain exact; decompose the matrix into Konva
  `x, y, rotation, scaleX, scaleY, skewX`.
- **SVG layers scale with the layer box** (stretch, like `preserveAspectRatio="none"`), strokes scale with it, as in SVG.
- **Shape layers generate at real width/height** so stroke widths stay true pixels when resized.
- One layer per SVG with a path list and colour swatches; **no ungrouping** (the app has no groups).

Implementation notes (Phase 2):

- Shape geometry is generated for the box **minus the stroke width** and offset by half of it (a per-path translate
  transform), so a stroke always stays inside the layer's box, like borders on other layers.
- Shapes are built from absolute `M/L/Q/C/Z` only (ellipses are four cubics, not arcs), which keeps the bounds easy to
  verify: tests check every shape at several box sizes and at the min/max of every slider.
- Shapes use round line joins (a mitred star point with a thick stroke spikes far outside its box).
- `PathsContent` adds a transparent rect so a layer's click target and selection box are its full w×h, not just the
  ink (a thin squiggle would be nearly impossible to grab). It draws nothing, so export doesn't need it.
- A swoosh is a closed filled band (constant or tapered thickness), not a stroked line, so it fills like other closed shapes.
- `Paint` includes linear and radial gradients and the renderer already maps them (`render/paint.ts`); the SVG
  importer in Phase 3 only has to produce them. Konva has no radial *stroke* gradient, so that case falls back to the first stop.

- `VectorPath` gained an optional `dashOffset` (Phase 4): a revealed dashed stroke may need a negative offset
  (see [ADR-0011](0011-path-level-animation-and-dash-reveal.md)). Path presets don't change stored paths; they produce
  derived, animated copies at render time.

## Alternatives considered

| Option | Why not |
|---|---|
| Convert each SVG path to its own layer | Needs layer groups, floods the layers panel, makes re-colouring a logo tedious. |
| Bake transforms into `d` | Breaks gradient geometry; complicates stroke scaling. |
| Store shapes as static SVG (like uploads) | Loses the sliders and true-pixel strokes. |
| Keep rasterising | Cannot animate or recolour. |

## Consequences

- (+) Draw-on, wobble and the like are implemented once and work on both layer types.
- (+) Shapes stay small in the JSON (params only).
- (-) `Konva.Path` per path can be slow for very complex SVGs; we warn above 1,000 paths.
- (-) Stretching an SVG by resizing distorts strokes (consistent with SVG, but unlike Figma's constrained scaling).
