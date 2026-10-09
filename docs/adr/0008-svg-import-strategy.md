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
