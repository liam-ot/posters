# ADR-0005: Timing model: in / out / loop phases and poster BPM

**Status:** Accepted

## Context

Users want entrances, exits and continuous loops, alone or combined, and want motion to lock to the music's tempo
for dance-event posters.

## Decision

- Each animation has a **phase**: `in`, `out` or `loop`.
- A layer may have **at most one `in`, at most one `out`, and any number of `loop`** animations. All combinations
  are valid.
- `in` starts at `delay` seconds. `out` ends `endOffset` seconds before the timeline end (anchored to the end, so
  changing the duration does not strand it). `loop` runs for the whole timeline with a `period`.
- **Out presets reuse the in-curve played backwards**: presence `p = ease(1 - q)` where `q` is progress through the
  window (in uses `ease(q)`). So an out is the exact time-mirror of the same in, and each preset defines one curve.
  (Considered `1 - ease(q)`: with overshooting easings like back it would push `p` below 0 at the end of an exit.)
- Composition: translate and rotation add; scale and opacity multiply; `draw` takes the min of in/out contributions.
- `TimelineConfig` gains optional `bpm` and `beatsPerBar` (default 4). Loop `period` can be in seconds, beats or bars;
  beat/bar units are disabled when no BPM is set.

## Alternatives considered

| Option | Why not |
|---|---|
| Multiple `in` animations per layer | Combination semantics (overlap, precedence) become confusing and need a stacking UI. |
| Absolute start/end for every animation | Exit would drift when the timeline duration changes. |
| BPM only at the animation level | Different layers would drift out of sync; tempo belongs to the poster. |

## Consequences

- (+) Simple mental model, small UI, easy to map onto timeline bars (Phase 5).
- (+) BPM unlocks beat-synced pulses and a beat grid with snapping.
- (-) Cannot stack two entrances on one layer in v1. Mitigation: the slide, scale and rotate presets have a **Fade**
  toggle so the common "move + fade in" combination is one animation.
- Presence for in/out can exceed 1 or dip below 0 with overshooting easings; presets clamp where it matters
  (opacity 0..1, scale >= 0).
