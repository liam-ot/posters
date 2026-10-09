# Architecture Decision Records

Decisions made while scoping and building the SVG + animation extension
(see [docs/plans/svg-animation.md](../plans/svg-animation.md)). One decision per file,
numbered in the order they were made. Status is one of **Proposed**, **Accepted**,
**Superseded by ADR-NNNN**.

When a decision changes, don't edit the old ADR: add a new one and mark the old one superseded.

| # | Decision | Status |
|---|---|---|
| [0001](0001-animation-model-presets-keyframe-ready.md) | Animation model: presets + procedural modifiers, keyframe-ready | Accepted |
| [0002](0002-shared-render-config-layer.md) | One shared render-config layer for canvas and export | Accepted |
| [0003](0003-animated-inner-group.md) | Apply animation on an inner group, never the transformable outer group | Accepted |
| [0004](0004-deterministic-time-and-seamless-loops.md) | Animation is a pure function of time; loops must be seamless | Accepted |
| [0005](0005-layer-timing-and-bpm.md) | Timing model: in / out / loop phases and poster BPM | Accepted |
| [0006](0006-rest-state-and-still-output.md) | Rest state for editing, stills and thumbnails | Accepted |
| [0007](0007-vector-layer-data-model.md) | Vector data model: `svg` and `shape` layers share `VectorPath` | Accepted |
| [0008](0008-svg-import-strategy.md) | SVG import via the browser DOM, sanitised, with tiered fidelity | Accepted |
| [0009](0009-schema-compatibility.md) | Schema compatibility: optional fields + `normalizeDoc` | Accepted |
| [0010](0010-testing-strategy.md) | Testing strategy: unit-test pure modules with Vitest | Accepted |
