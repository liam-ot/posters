# ADR-0004: Animation is a pure function of time; loops must be seamless

**Status:** Accepted

## Context

MP4 export renders each frame by calling `renderSceneToCanvas(doc, t, scale)` and piping frames to ffmpeg. Posters
loop, so an exported video whose last frame does not match its first visibly "jumps".

## Decision

1. Every animation is a **pure function of `t`** (and the layer/doc). No wall-clock, no CSS or SMIL animation, no
   `Math.random()` at render time. Randomness is seeded.
2. Periodic presets use `cycle = (t / periodSec) % 1`. A loop is seamless when its period divides the timeline
   duration; the Inspector shows a hint otherwise, and with BPM set offers "Fit duration to N bars".
3. Noise-based presets (jitter, wobble) sample **4D simplex noise on a circle**
   (`noise4D(x, y, R*cos(2*pi*t/D), R*sin(2*pi*t/D))`, via `createNoise4D` from the existing `simplex-noise`
   dependency) so the frame at `t = D` equals the frame at `t = 0` exactly.
4. Optional `step` rate on jitter/wobble quantises time (`t' = floor(t*rate)/rate`) for a hand-drawn "boil".

**Update (Phase 4):** `simplex-noise`'s 4D noise is slightly discontinuous (~0.1% of its range) at exact lattice
points. The loop circle starts at `w = 0` and shapes often have points with a zero coordinate, so frame 0 differed
from its immediate neighbours. Loop noise now starts the circle at an irrational angle and offsets the spatial
coordinates, so samples don't land on lattice ties. The worst seam error along `y = 0` went from 4e-3 to 2e-15.

## Alternatives considered

| Option | Why not |
|---|---|
| CSS/SMIL animation on SVG content | Not controllable per frame, so MP4 export could not capture it deterministically. |
| Stateful simulation (integrate per frame) | Scrubbing and export would depend on history; breaks random access to any `t`. |
| Cross-fade the loop seam | Visible ghosting; circular noise solves it exactly. |

## Consequences

- (+) Scrubbing, playback, still export and MP4 export all agree.
- (+) Property-testable: `evaluate(t=0) == evaluate(t=duration)` for every loop preset.
- (-) Seamlessness is the author's responsibility for non-dividing periods (hinted, not forced).
