# ADR-0006: Rest state for editing, stills and thumbnails

**Status:** Accepted

## Context

A layer with a fade-in at 0s is invisible at `t = 0`, which is awkward while editing, and a PNG export or gallery
thumbnail taken at the playhead may show a half-built poster.

## Decision

- Evaluation takes `ctx.rest`. In rest state `in` progress = 1, `out` progress = 0, and loops are at their neutral
  (identity) value: the "complete poster".
- The canvas shows **the frame at the playhead** (WYSIWYG) with a **"Show rest state"** toggle (`useUI.showRest`).
  Pressing play turns the toggle off.
- **PNG/JPG export and gallery thumbnails default to rest state.** The export dialog offers "Current frame" as an
  alternative. Thumbnails stop capturing the live stage and use `renderSceneToCanvas(doc, 0, ratio, { rest: true })`.

## Alternatives considered

| Option | Why not |
|---|---|
| Always rest state when paused | Cannot inspect the actual frame at a point in time. |
| Always playhead frame | Editing a layer that is invisible at the playhead is frustrating; thumbnails look broken. |

## Consequences

- (+) Predictable stills; a clean gallery.
- (-) Two display modes to explain; mitigated by an obvious toggle.
- (-) Thumbnails now cost an off-screen render instead of a stage capture (small).
