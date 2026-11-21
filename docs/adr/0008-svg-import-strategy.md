# ADR-0008: SVG import via the browser DOM, sanitised, with tiered fidelity

**Status:** Accepted

## Context

No tool fully supports SVG. Figma converts to its own nodes and silently drops filters, most masks and patterns;
Illustrator/Inkscape import nearly everything; Canva keeps the SVG whole and exposes colour swatches; After Effects
and Rive import paths/fills/strokes/gradients and drop the rest. We need a defensible v1 boundary and good behaviour
at that boundary.

## Decision

**Parse with the browser, not a hand-written CSS cascade.** Sanitise, mount in a hidden container (not `display:none`,
which breaks `getScreenCTM`), read resolved styles with `getComputedStyle`, and compute local-to-viewBox matrices with
`getScreenCTM`. Always remove the container afterwards.

**Sanitise before anything touches the live DOM:** remove `<script>`, `<foreignObject>`, `on*` attributes and any
`href`/`xlink:href` not starting with `#` (except `data:image/*` on `<image>`, for the stretch goal).

**Fidelity tiers**

| Tier | Scope | v1 |
|---|---|---|
| 1 | paths, basic shapes, groups, transforms, CSS/`<style>`, `<use>`/`<defs>`, viewBox | In |
| 2 | linear and radial gradients | In |
| 3 | `clipPath`, embedded `<image>` | Stretch (ask first) |
| 4 | masks, filters, patterns, markers | Later |
| 5 | `<text>` | Later |

Anything skipped is **listed in a warning with counts**, and the user can choose **"Use flat image instead"**
(today's behaviour). Added beyond competitors: **colour swatches** over the SVG's unique colours (Canva-style),
because for logos the common edit is swapping a brand colour.

Implementation notes (Phase 3):

- **Isolation:** the SVG is mounted in a hidden `<iframe sandbox="allow-same-origin">`, not in the app's DOM. SVG
  `<style>` rules are document-global, so mounting inline would let an imported `.cls-1{…}` restyle the app, and the
  app's Tailwind reset would leak into the SVG's computed styles. The sandbox (no `allow-scripts`) also means no script
  can run even if the sanitiser missed something.
- **`<use>`** is expanded into clones before measuring, because the browser doesn't expose a `<use>` shadow tree.
  `<symbol>` becomes a group; depth is capped to stop cycles.
- **Gradients** are resolved to coordinates in each path's own space (`objectBoundingBox` via `getBBox`, `href`
  inheritance, `gradientTransform` applied to the endpoints). Konva draws circular radial gradients and perpendicular
  linear isolines, so a gradient under a non-similarity transform is *approximated* and listed in the warnings.
  `spreadMethod` reflect/repeat is drawn as pad (also warned).
- **Group opacity** is multiplied into each child path. Exact unless siblings overlap, where the overlap blends twice;
  measured on a fixture as exactly the overlap area (≈1,300 px). An exact version needs group compositing in the model.
- Stroke-only paths and `visibility:hidden` are kept (hidden ones as `visible:false`); fully invisible paths
  (no fill and no stroke) are dropped. `display:none` subtrees are skipped.
- `svgpath` was **not** added: Konva parses all path commands itself, so it's only needed for Phase 4's wobble.
- Tier 3 (`clipPath`, embedded `<image>`) is **not** implemented; both are reported as ignored/skipped. Needs the user's go-ahead (see plan).
- Sanitiser: the rules are pure functions with unit tests; the DOM walk is verified against a hostile fixture
  (`test/fixtures/svg/09-malicious.svg`) — no script ran, no network request was made (checked against a positive
  control), and the stored source contains none of: script, event handlers, `javascript:`, foreignObject, iframe,
  external URLs, `@import`, SMIL.

## Alternatives considered

| Option | Why not |
|---|---|
| Hand-written parser + CSS cascade | Illustrator exports rely heavily on `<style>` classes; reimplementing is error-prone. |
| Third-party SVG parser library | Extra dependency; still would not resolve computed styles as faithfully as the browser. |
| Silent best-effort (Figma) | Surprising for users; a warning is cheap and honest. |
| Rasterise unsupported elements | Good future fallback, not v1. |

## Consequences

- (+) Style resolution and transforms match what the browser renders.
- (+) Untrusted SVG cannot run script (checked with a malicious fixture).
- (-) Group opacity over overlapping children is approximated by multiplying into each path (documented in code).
- (-) Depends on DOM APIs, so verified with fixtures in the app rather than unit tests (pure helpers are unit-tested).
