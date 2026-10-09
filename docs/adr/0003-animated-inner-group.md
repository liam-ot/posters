# ADR-0003: Apply animation on an inner group, never the transformable outer group

**Status:** Accepted

## Context

In `LayerNode`, the outer `<Group>` carries the layer's `x, y, rotation, opacity, blendMode` and is what the Konva
`Transformer` attaches to. Drag and transform handlers read the node's position/scale and write them back to the
document. If animation offsets were applied to that outer group, then dragging or resizing a layer mid-animation
would **bake the animated offset into the saved document**.

## Decision

Animated values live on a **new inner Group**; the outer group stays untouched.

```
Outer Group  (id, x, y, rotation, opacity, blend: unchanged, drives Transformer)
└─ Inner Group  x = w/2 + dx, y = h/2 + dy, offset = (w/2, h/2),
   │            rotation, scaleX/Y, opacity   <- from LayerFrame
   └─ content
```

Scale and rotation pivot around the layer centre via `offset`. Built once as `animatedGroupConfig(layer, frame)` in
`src/render/` and used by both renderers. Only layers with at least one enabled animation subscribe to the clock, so
static layers do not re-render per frame.

## Alternatives considered

| Option | Why not |
|---|---|
| Animate the outer group and subtract the animation on drag end | Fragile; every edit path (drag, transform, nudge, inspector) would need the correction. |
| Pause animation while a layer is selected | Breaks the WYSIWYG goal and hides the very motion being tuned. |
| Separate Konva layer for animated content | Loses z-order interleaving with static layers. |

## Consequences

- (+) The document only ever contains authored values.
- (+) The selection box stays at the layer's authored position while it animates. **This is not automatic:** Konva's
  `Transformer` sizes its box from the node's content *including* child transforms, so the box would follow the
  animation and collapse to nothing at scale 0. `LayerNode` therefore overrides the outer group's `getClientRect`
  (for the `skipTransform` call the Transformer makes) to measure the content relative to the inner group. Verified:
  the box is identical at every time and in rest state.
- (-) One extra node per layer. Every layer gets the inner group (identity when not animated) so the React tree stays
  stable when animations are added or removed; an identity group renders pixel-identically (checked against saved posters).
- (-) Drag-snapping to the artboard centre still measures the visual bounds (`getClientRect` without `skipTransform`),
  so while an animated layer is mid-animation it snaps by what you see. Acceptable; revisit if it annoys.
