# ADR-0001: Animation model: presets + procedural modifiers, keyframe-ready

**Status:** Accepted

## Context

Only generator layers animate today. We want every layer (rect, text, image, SVG, shapes) to animate.
The two mainstream models are:

- **Presets / behaviours** (Canva, Keynote builds, CapCut): pick an effect, set a few options.
- **Keyframes** (After Effects, Rive, Cavalry, Figma motion, Lottie, CSS `@keyframes`): set property
  values at moments on per-property tracks; the app interpolates.

Pro tools are keyframe-based with presets layered on top (a preset inserts keyframes). Some motion,
such as wiggle, is continuous and procedural and is not naturally keyframed (AE expressions, Cavalry
and Apple Motion behaviours).

## Decision

v1 ships **presets plus procedural modifiers**. Each layer carries an `animations: LayerAnimation[]` list.
Presets do not touch Konva; they are *channel sources*: given `(layer, t, ctx)` they write values into a
`LayerFrame` (`dx, dy, rotation, scaleX, scaleY, opacity, paths[]`). The evaluator composes all sources.
A future `KeyframeTrack` is simply another channel source writing the same channels.

## Alternatives considered

| Option | Why not (for v1) |
|---|---|
| Keyframes only | ~3-4x the work (per-property tracks, diamond editing, easing editor, copy/paste). Overkill for typical poster motion; slow to a first good result. |
| Presets with no shared channel model | Fastest, but would force a rewrite to add keyframes later, and make presets hard to combine. |
| Both in v1 | Doubles the surface area before we know which parts get used. |

## Consequences

- (+) Small UI: an Inspector list and simple timeline bars.
- (+) Adding keyframes in v2 means a new channel source and a track editor, not an engine rewrite.
- (+) Wiggle/jitter fit naturally as procedural presets.
- (-) Bespoke choreography ("spin, pause, spin back halfway") is not expressible until v2.
- (-) Generator `animated` stays a separate concept in v1 (unify in v2).
