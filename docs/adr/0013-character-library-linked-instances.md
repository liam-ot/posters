# ADR-0013: Character library: linked instances with snapshots

**Status:** Accepted

## Context

A rigged character (mesh, pins, motions) is work to set up and is reused across many posters. Rigging also needs room:
a big canvas, pin and motion lists, a timeline — which would crowd the poster editor.

## Decision

- A separate **Library** area (gallery tab "Characters") stores assets in `data/assets/`. The first and only kind in v1
  is `puppet`; storage, API and UI are built so other kinds can be added.
- Characters are rigged only in a **Puppet studio** view. A character holds several **named motions** (Idle, Dance…).
  An `svg` or `shape` layer can be turned into a character ("Open in puppet studio").
- Posters place a character as a **linked instance** layer (`type: 'puppet'`) that picks a motion and follows the
  poster's BPM. Layer animations still apply on top; colours can be **overridden per instance**.
- The instance stores a **snapshot** of the asset and the `version` it came from. Rendering and export read only the
  snapshot (deterministic, never waiting on the network). On poster open the snapshot refreshes if the library
  version is newer — outside undo history. **Detach** freezes an instance; a deleted asset leaves posters rendering
  their snapshot, detached.
- Deformation is solved in the character's own space, then stretched to the instance box like an After Effects
  precomp, so resizing an instance costs nothing.

## Alternatives considered

| Option | Why not |
|---|---|
| Rig inline on poster layers | Same character rigged again per poster; crowds the poster UI. |
| Copy on placement (no linking) | Fixes must be re-applied in every poster. |
| Link without snapshot (fetch asset at render) | Export depends on the library being present and unchanged; deleting an asset breaks posters. |
| One motion per character | Different moves would mean duplicating the rig. |

## Consequences

- (+) Rig once, reuse everywhere; edits propagate; posters stay self-contained.
- (+) Matches familiar models: AE precomps, Rive nested artboards, Figma components.
- (-) Snapshots duplicate asset data in each poster (roughly 10–50 KB per character).
- (-) A second editing view with its own undo history and autosave.
