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
  `generateShape(kind, params, w, h)`.
- `VectorPath` holds `d`, a per-path `transform`, `fill`/`stroke` as `Paint` (solid, linear or radial gradient),
  stroke attributes, `fillRule`, `opacity`.
- `getLayerPaths(layer) -> VectorPath[]` feeds one renderer (`Konva.Path`); path-level animations only see `VectorPath[]`.

Specific choices:

- **Transforms stay per path** (not baked into `d`) so gradients remain exact; decompose the matrix into Konva
  `x, y, rotation, scaleX, scaleY, skewX`.
- **SVG layers scale with the layer box** (stretch, like `preserveAspectRatio="none"`), strokes scale with it, as in SVG.
- **Shape layers generate at real width/height** so stroke widths stay true pixels when resized.
- One layer per SVG with a path list and colour swatches; **no ungrouping** (the app has no groups).

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
