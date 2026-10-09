# ADR-0002: One shared render-config layer for canvas and export

**Status:** Accepted

## Context

Each layer type is currently drawn in two places: `src/canvas/LayerNode.tsx` (live, react-konva) and
`src/export/renderScene.ts` (export, imperative Konva). They already duplicate rect/ellipse/text/image/border
logic. Every new layer type or animation feature would have to be written twice, and the preview and the
exported PNG/MP4 would drift apart over time.

## Decision

Add `src/render/` containing **pure functions that return Konva node configs** (plain objects), e.g.
`rectConfig(layer)`, `ellipseConfig(layer)`, `textConfig(layer)`, `borderConfig(...)`. Both renderers consume them:

```ts
// live:   <Rect {...rectConfig(layer)} />
// export: new Konva.Rect(rectConfig(layer))
```

Rule going forward: **no drawing decision lives in only one renderer.** This refactor lands first (Phase 0)
with no behaviour change, so regressions can be attributed to it alone.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep two renderers, be careful | The status quo; drift is inevitable and it gets worse with animation. |
| Render export by capturing the live stage | Export needs a different pixel ratio, no transformer/view transform, and deterministic per-frame time. The existing code already moved away from this. |
| Build a retained scene graph abstraction | More machinery than needed; config objects get 95% of the benefit. |

## Consequences

- (+) New layer types and animations are written once.
- (+) Config builders are pure, hence unit-testable without a DOM.
- (-) Up-front refactor with no user-visible payoff; mitigated by verifying identical output on existing posters.
- (-) react-konva props and Konva constructor options are not always identical (event handlers, refs); configs cover
  drawing props only, interaction stays in `LayerNode`.
