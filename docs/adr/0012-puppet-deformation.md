# ADR-0012: Puppet deformation: mesh-based ARAP with pins

**Status:** Accepted

## Context

Users want to animate *parts* of one piece of vector artwork — a character's arms and legs — when the artwork was
never split into parts. Imported SVGs are often traced bitmaps: in "Poster 5" the taco's body, arms, legs and hat are
one 18,700-character path. The tool has to be general: users will bring many different SVGs.

## Decision

Follow the After Effects Puppet tool:

- Build a **triangle mesh** over the artwork's **silhouette** (rasterised alpha, small gaps closed, holes filled, so
  inner details move with their surroundings and gaps between limbs stay empty). The mesh is generated once and
  **stored**, so every renderer and every session uses the identical mesh.
- Users drop **pins** anywhere. Dragging a pin sets a **pose**; the mesh follows with **two-step as-rigid-as-possible**
  deformation (Igarashi, Moscovich, Hughes 2005). Pins are soft constraints at barycentric positions, so the
  factorised system depends only on mesh and pin placement and each frame is two back-substitutions.
- Every path point (anchors and control points, after subdividing long runs) is bound to a triangle by barycentric
  coordinates and moves with it. Output stays vector.
- Pins can have a **parent** (swing around it, inherit its motion: forward kinematics) and **loop presets** (swing,
  bob, circle, beat squash). **Starch pins** stiffen an area by weighting ARAP edges.
- When every pin is at rest, geometry is returned **exactly** unchanged.

## Alternatives considered

| Option | Why not |
|---|---|
| Per-limb "bend regions" (lasso + pivot, rotation grows along the limb) | Tied to limbs; pins placed anywhere cover it and much more. |
| Rigid cut parts (lasso a region, rotate it) | Visible seam at every joint; wrong look for rubber-hose characters. |
| Distance-weighted point dragging (e.g. moving least squares) | Bleeds across nearby parts: moving one foot drags the other leg. The mesh carries the bend *through* the shape. |
| Full bones with painted weights (Rive, Spine) | Most powerful, but several times the build and a steep learning curve. Pins with parents give chains already. |
| Users split artwork into parts in Illustrator first | Not possible for most traced art without manual knife work; still supported by importing parts separately. |

## Consequences

- (+) Works on any vector artwork, including single traced outlines; no seams; export stays vector and exact.
- (+) Mesh and solver don't depend on path data, so raster images can be warped later with a renderer change.
- (-) Gradient fills keep their undeformed geometry.
- (-) Dense factorisation caps mesh size (~600 vertices); a sparse solver can replace it behind the same interface.
- (-) Draw-on uses rest path lengths, slightly approximate while bent.
