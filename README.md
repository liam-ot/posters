# Poster Studio

A local, browser-based, Figma-like design tool for making posters for a dance
event. Create posters on an infinite-zoom canvas with shapes, text, images, and
generative graphics (noise, static, patterns, motion), then export to **PNG**,
**JPG**, or **MP4** straight into the project folder.

No accounts, no cloud, no database — everything is stored locally on disk.

## Requirements

- **Node 22 LTS** (or newer)
- **pnpm 10+**
- **ffmpeg** on your `PATH` (used for MP4 export). Verify with `ffmpeg -version`.
  - macOS: `brew install ffmpeg`
- A **Chromium browser (Chrome or Edge)** is recommended.

## Getting started

```bash
pnpm install
pnpm dev
```

Open the printed URL (default http://localhost:5173). A single process serves
both the app and the local file API — there is no separate backend.

## How it works

- **Gallery** — every poster is one JSON file under `data/posters/`. Create,
  open, rename, duplicate, and delete from the gallery. Posters autosave while
  you edit (a thumbnail is regenerated on each save).
- **Editor** — a Konva-powered canvas with move/resize/rotate handles, a layers
  panel, and an inspector.
  - **Toolbar:** rectangle, ellipse, text, image, shapes, and generative effects.
  - **Shapes:** 12 parametric shapes (star, polygon, burst, ring, arrow, squiggle,
    wave, spiral…) with sliders for fill, stroke, dashes and caps.
  - **SVG:** choosing an `.svg` in the Image tool imports it as editable vectors —
    recolour from a palette of its colours, hide or restyle individual paths.
    Features that aren't supported yet (filters, masks, text, patterns…) are listed in
    a warning, with a "use flat image instead" option.
  - **Animation:** every layer can have an *in*, an *out* and any number of *loop*
    animations (fade, slide, scale, rotate, pulse, float, spin, sway, jitter, blink).
    Shapes and SVGs also get path-level ones: **draw on** (strokes trace in, dotted and
    dashed strokes appear dot by dot, filled logos outline then fill, with stagger and
    ordering), **fade paths**, **wobble** and **dash flow**.
    Set a BPM in the timeline bar to time loops to beats or bars. The eye button
    shows the finished poster ("rest state"); PNG/JPG exports and gallery thumbnails
    use it by default.
  - **Generators:** _Noise_ (simplex), _Static_ (TV snow), and _Pattern_
    (stripes/dots/grid/checker/waves). Mark a generator **Animated** and use the
    timeline (bottom) to play/scrub. Compose layers with opacity and blend modes.
  - **Fonts:** a curated set of bundled fonts plus your own — drag a
    `.ttf/.otf/.woff2` into the font picker’s upload button; it’s registered and
    persisted under `data/fonts/`.
- **Characters & puppet studio** — the gallery's **Characters** tab holds reusable
  characters, rigged once in the **puppet studio** and placed in any poster as linked
  copies (toolbar person icon). Make one from an SVG file, or select an SVG/shape layer
  and use **Open in puppet studio**.
  - The studio fits a triangle **mesh** to the artwork's outline; click to drop **pins**
    (Alt-click: **starch** pins that stiffen an area) and drag them to bend it.
  - **Motions** (Idle, Dance…) rock between their own pose and the base pose, and pins
    can loop (swing around a parent pin, bob, circle, beat bounce) — timed in beats so
    they follow each poster's BPM.
  - In a poster: pick the motion, recolour just that copy, or detach it. Library edits
    reach linked posters the next time they open.
  - Full guide: *Puppet Studio — how to use it* (shared doc); design in
    `docs/plans/puppet-pins.md` and ADR-0012/0013.
- **Export** (top-right) writes files to the **project root**:
  - `PNG` / `JPG` — the current frame at 1×/2×/3× the artboard size.
  - `MP4` — renders every frame over the timeline and assembles an H.264 video
    via ffmpeg. Set duration and FPS in the timeline bar.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Undo / Redo | `⌘Z` / `⌘⇧Z` |
| Duplicate | `⌘D` |
| Delete selection | `Delete` / `Backspace` |
| Nudge (×10 with Shift) | Arrow keys |
| Add rectangle / ellipse / text | `R` / `O` / `T` |
| Pan canvas | two-finger scroll on a trackpad · `Shift` + wheel sideways · hold `Space` + drag |
| Zoom | pinch · `⌘`/`Ctrl` + scroll |
| Copy a layer by dragging | hold `Alt` (`⌥`) while dragging it |
| Deselect | `Esc` |
| Edit text | double-click a text layer |
| Studio: add pin / starch pin | click / `Alt`-click the artwork |
| Studio: delete pin | `Delete` / `Backspace` |

## Where files live

```
<project root>/
├─ Poster-Name.png / .jpg / .mp4   ← your exports land here
└─ data/                            ← local "database" (gitignored)
   ├─ index.json                    ← poster list for the gallery
   ├─ posters/<id>.json             ← one document per poster
   ├─ posters/<id>.thumb.png        ← gallery thumbnail
   ├─ assets/<id>.json + .thumb.png ← library characters (assets/index.json lists them)
   └─ fonts/                        ← uploaded custom fonts
```

## Production

```bash
pnpm build   # bundles the app to dist/
pnpm start   # serves dist/ + the same /api on http://localhost:4321
```

## Notes

- MP4 export requires ffmpeg; if it isn’t installed the render step will report
  an error (PNG/JPG export still work).
- WebCodecs isn’t used — frames are rendered deterministically in the browser
  and encoded by your local ffmpeg, so quality doesn’t depend on machine speed.
