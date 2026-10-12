# Plan: Clouds & Aura motion generators (WebGL), after the Noise & Texture plugin

> **For the implementing agent:** work through the phases **in order**. At the end
> of every phase: run `pnpm typecheck` and `pnpm test`, verify in the running app
> (`.claude/launch.json` → `poster-studio`), add notes under §8, tick §9, then
> **stop and report to the user**. Do not start the next phase until the user
> confirms. Match the existing code style: small focused modules, terse comments
> explaining *why*. Read `docs/plans/noise-texture-motions-research.md` (what every
> control does, from screen recordings) and `docs/adr/0004` (loops) first.

---

## 1. Goal

Add two animated generator layers modelled on the **Motion** tab of the Figma
plugin *Noise & Texture*: **Clouds** and **Aura**. Same controls and ranges as the
plugin, behaving as recorded, close in look (not pixel-identical — we can't see
their code). Build the renderer so the plugin's other motion effects can be added
later as more shaders.

## 2. Decisions already made (do not re-litigate)

| Topic | Decision |
|---|---|
| Renderer | **WebGL fragment shaders** for these generators. One shared offscreen WebGL context renders, then the pixels are copied into each layer's own 2D canvas, so Konva, the timeline, thumbnails and PNG/MP4 export use the existing generator path unchanged. Existing CPU generators (noise, static, pattern) stay as they are. |
| Loops | Must loop **exactly** over the poster duration (ADR 0004). Clouds drift with **crossfade drift** (two drifting copies of the field take turns, each resetting while invisible), so drift runs at the real speed on any poster length. Evolution uses circular time. Aura's morph uses circular time. *(Changed in Phase 1: a wrap-around drift would have to cross the whole frame at least once per loop, far too fast on short posters. The user chose crossfade drift.)* |
| Stacking / blend | **One layer per effect.** Use the existing layer `opacity` and `blendMode`; no in-layer effect stack, no per-effect Opacity/Blend controls. |
| Fidelity | Same controls, ranges and defaults as the plugin; look tuned against the user's recordings (§7). |
| Aura start | The blob always starts in the **lower-left**, as in the plugin (fixed starting state). |
| Schema | `schemaVersion` unchanged; new `GeneratorKind`s and params are additive (ADR 0009). |

## 3. Out of scope (do not build)

- The plugin's other ~10 motion effects (later: one shader each, same runtime).
- The plugin's Pattern and Image tabs.
- An in-layer effect stack.
- A CPU fallback that looks the same. Without WebGL, show the layer as a flat
  sky-gradient / background fill and log once.

## 4. Architecture

### 4.1 Shader runtime (`src/generators/gl/`)

- `context.ts`: lazily creates **one** offscreen `<canvas>` with a WebGL2 context
  (browsers cap live contexts at ~16, so never one per layer). Handles
  `webglcontextlost` / restored by rebuilding programs.
- `program.ts`: compiles a full-screen-triangle program per fragment shader and
  caches it by kind. Uniform helpers for float / vec2 / vec3 / vec4.
- `renderShader(kind, w, h, uniforms) → HTMLCanvasElement`: sizes the shared canvas,
  draws, returns it. Callers immediately `drawImage` it into their own 2D canvas.
- `runtime.ts` `renderGenerator(...)` gains a branch for shader kinds and a new
  argument, **`loopSec`** (the timeline's `durationSec`), needed for exact loops.
  Thread it through `GeneratorContent` and `export/renderScene.ts`.
- Resolution: keep the existing caps (`MAX_DIM` live, `GENERATOR_CAP` export). Revisit
  in Phase 3 if shaders are fast enough for full size.

### 4.2 Loop-safe time (pure TS, unit-tested)

`src/generators/loopTime.ts`:

- `phase = (t / loopSec) mod 1`, angle `θ = 2π·phase`.
- Evolution: pass `(cos θ, sin θ) · R` to the shader as two extra noise dimensions
  (circular time, as ADR 0004 does for wobble).
- Drift: cloud field is periodic with period 1 in x (tileable noise: integer
  lattice periods). Drift offset = `cycles · phase` where
  `cycles = round(speed · loopSec · DRIFT_RATE)` — an **integer**, so the field is
  back where it started at `t = loopSec`. Speed 0 → `cycles = 0` and no evolution:
  frozen, as in the plugin.
- Consequence: speed changes in steps on short posters. Document it in the
  Inspector hint like the existing "period doesn't divide duration" hint.

### 4.3 Clouds (`clouds.frag`)

> **Superseded during Phase 1:** the shading model below was replaced. See §8 Phase 1 for what was built.

Params (defaults from the plugin): `colorA` top sky, `colorB` bottom sky (both with
alpha), `speed 0.2`, `scale 0`, `light 0.5`, `shadow 0.5`, `tint 0.6`,
`coverage 0.28`, `alpha 1`. All sliders 0–1, step 0.01.

1. **Sky:** vertical gradient `colorA → colorB`.
2. **Density:** tileable fBm (6–8 octaves) of the drifting, evolving field.
   `scale` zooms in: frequency goes from "many small clouds" (0) down to
   "one cloud fills the frame" (1).
3. **Coverage:** threshold on density; higher grows the same shapes outward with
   lacier edges. The effect is modest: coverage 0 still shows sizeable clouds.
4. **Alpha:** blends between a hard cut-out (1: clouds with clear sky gaps) and
   no cut-out (0: soft mottled cloud texture over the whole frame, sky showing
   through).
5. **Shading:** sample density a little toward the light (up) for a cheap
   self-shadow term. Thick/shaded parts darken by `shadow`; lit parts brighten
   toward cream-white by `light`.
6. **Tint:** shadow colour = mix(neutral grey, sky colour at that pixel, tint).
7. Must reproduce the recorded edge cases: Light 0 + Shadow 1 + Tint 1 → clouds
   equal the sky (plain gradient); Light 0 + Shadow 0 → flat pure-white shapes.

### 4.4 Aura (`aura.frag`)

Params: `background` (colour with alpha, default `#000000`), `color` (default
`#5000FF`), `speed 1`, `detail 0.49`. Sliders 0–1.

1. **Blob:** a rounded shape from a circle SDF warped by low-frequency loop noise;
   it morphs and floats without rotating. Fixed starting placement in the
   lower-left (match the first frames of the recordings).
2. **Glow:** back-light along one edge spilling into the lower-left corner, a thin
   bright rim on the outline, a dark, faintly tinted, translucent interior.
3. **Streaks:** fine smoke / long-exposure streak texture, e.g. noise stretched
   along the outward normal, rippling with time.
4. **Per-channel spread (key look):** compute the glow falloff **separately for R,
   G and B** with different widths: **red widest, blue middle, green tightest**.
   Multiply each by that channel of `color`. Pure red stays red; lime gets a green
   rim and a red outer glow; violet a blue rim and a magenta→red fringe (see the
   research table).
5. **Detail:** 0 = near-empty dark haze; ~0.5 = blob with soft streaky glow; 1 =
   sharper, larger blob and a strong, solid glow filling a corner.
6. **Composite:** glow is **added light** over `background`, clamped: full
   strength on black, faint on light grey, invisible on white.

### 4.5 Config & UI

- `GeneratorKind` += `'clouds' | 'aura'`; add entries in `generators/config.ts`
  with the controls above. Colour controls must allow alpha (the recent colour
  picker with opacity).
- New generators default to `animated: true`.
- Add them to the generator menu in `src/ui/Toolbar.tsx` (~line 118); `lib/layers.ts` `createLayer` builds the layer.

## 5. Phases

### Phase 0: Shader runtime
- `gl/context.ts`, `gl/program.ts`, `renderShader`; `loopSec` threaded through.
- A throwaway test shader (a gradient that moves with phase) proves the live
  canvas, thumbnail, PNG and MP4 export all render it, with no context leaks when
  layers are added and removed.
- `loopTime.ts` + unit tests: `phase(0) == phase(loopSec)`, integer drift cycles,
  speed 0 frozen.

### Phase 1: Clouds
- `clouds.frag` + config + defaults. Tune against the reference frames (§7) at the
  same slider values. Check each slider at 0 and 1 against the recordings.
- Verify the loop seam: export a short MP4 and compare the first and last frames.

### Phase 2: Aura
- `aura.frag` + config. Tune the colour spread with the colours in §7 (FF0000,
  8CFF00, 3700FF, 00FF6E, FFA200) and backgrounds (000000, BABABA, FFFFFF).

### Phase 3: Polish
- Performance: measure frame time at 512 px and at export size; raise the caps if
  cheap. Never re-render unchanged frames.
- Inspector hint for stepped speed on short loops.
- ADR-0014 "WebGL shader generators" (shared context, loop-safe time).
- Delete the Phase 0 test shader.

## 6. Risks & gotchas

- **Context limits / loss:** only ever one GL context; handle `contextlost`.
- **Premultiplied alpha:** colours with alpha and the Aura background opacity must
  composite correctly when copied to 2D. Use `premultipliedAlpha: false` or
  un-premultiply consistently, and test with a see-through background over a
  coloured layer.
- **Readback cost:** prefer `drawImage(glCanvas)` over `readPixels`.
- **Tileable noise:** use integer periods in the lattice hash. Non-integer drift
  shows a seam when the loop restarts.
- **Determinism:** no `Math.random()`, no wall-clock; same `t` → same pixels (export).
- **Tests:** jsdom has no WebGL; unit-test the pure TS (time, params). Check shaders
  in the running app.

## 7. Reference recordings (for tuning)

Extract frames with `ffmpeg -ss <sec> -i <file> -frames:v 1 -vf "crop=456:456:1662:878" out.png`
(the preview square; a 1100×1380 crop at 1600,600 includes the panel).

| File (`~/Desktop/Screen Recording 2026-10-13 at …`) | Shows |
|---|---|
| `01.01.33.mov` | Clouds, default greys, every slider swept while moving |
| `01.05.21.mov` | Clouds: speed 0 freeze (~8–12 s), red/yellow colours (~22–30 s), Scale sweep (35–41 s), opacity, blend list |
| `01.10.15.mov` | Clouds, red/yellow, speed 0: Coverage (18–25 s), Light (32–35 s), Shadow (37–42 s), Tint (43–47 s), extremes (52–60 s), Alpha (64–67 s) |
| `01.03.51.mov` | Aura, violet: Speed and Detail sweeps (Detail 0.01 ≈ 15 s, 1 ≈ 11 s) |
| `01.08.12.mov` | Aura colours (0–15 s), backgrounds white/grey (16–24 s), speed 0, opacity |

## 8. Implementation notes

### Phase 0 (2026-10-13)

- **Layout differs slightly from §4.1:** the GL code is one module, `src/generators/gl.ts`
  (context, program cache, `renderShader`). Shaders live in `src/generators/shaders/`:
  `common.ts` (the `ShaderGenerator` interface, `GLSL_HEAD`, `colorVec`) and `index.ts`
  (the `SHADERS` registry). They're split so shader files can import the shared code
  without a circular import.
- `renderGenerator(ctx, w, h, layer, t, loopSec)` dispatches to a shader when
  `SHADERS[kind]` exists. The fallback without WebGL fills with `shader.fallback(p)`.
- Common uniforms: `u_res`, `u_phase`, `u_drift`, `u_evo`, `u_seed` (0..1). In GLSL,
  `screenUv()` is y-down (top of the layer = 0).
- **Evolution doesn't step with speed:** `loopClock` scales the time-circle *radius*
  with `speed · loopSec`, so the noise changes at the same rate for any poster length.
  Only drift (whole tiles per loop) rounds to whole cycles.
- Shader generators are created with `animated: true`.
- Verified in the app with the temporary `gltest` shader: live canvas animates, gallery
  thumbnail and `renderSceneToCanvas` render it, and `t = 0` vs `t = loopSec` is
  pixel-identical (max diff 0; `t = loopSec − 0.01` differs by ≤ 2/255). MP4 export uses
  the same `renderSceneToCanvas`, so it wasn't exported separately.

### Phase 1 (2026-10-13)

- **Model.** The plugin's controls match a standard 2D cloud model. A two-colour sky
  gradient; cloud colour = base brightness (`(1 − Shadow)^1.5`) + detail × Light;
  Tint adds the sky colour into the clouds; mask = Coverage + Alpha × body + detail.
  This explains every recorded behaviour: Alpha 0 fills the frame with texture,
  Coverage 0 still shows clouds, Tint 0 is charcoal, Light 0 + Shadow 1 + Tint 1 hides
  the clouds. Written from scratch in `shaders/clouds.ts` (4D value noise from
  `GLSL_NOISE` in `common.ts`, with circular-time evolution). No code was copied
  from existing shaders.
- **Drift:** `crossfadeDrift` in `loopTime.ts` (unit-tested). Velocity was measured
  from the recordings by cross-correlating frames: speed 1 moves the clouds
  **0.22 / 0.09** of the frame per second, left and down. Speed scales linearly
  (speed 0.2 measured ≈ 0.035 / s). Ours measures −22.5 % / +7.5 % per second.
  `MAX_SHIFT = 1.0` frame per hand-over keeps hand-overs rare, so clouds mostly
  slide and keep their shape. `evolve: 0.12`.
- **Tuning** was done against the red/yellow recording (`01.10.15.mov`) at matching
  slider values: base, Light 0/1, Shadow 0/0.96, Tint 0/1, Alpha 0, Coverage 0/1.
  Mappings: `scale = 1.6·0.08^Scale`, `cover = 0.6·Coverage − 0.25`, `cut = 14·Alpha`,
  `detail = 0.6·Light`.
- **Defaults:** the plugin's sky colours are see-through and their exact values
  aren't shown. Ours are `rgba(200,200,200,0.15)` → `rgba(60,60,60,0)`: light,
  softly shaded clouds over a nearly clear sky, close to the plugin's first frame.
- **Verified:** the loop seam is pixel-exact (t = 0 vs t = 5 s). Frame-to-frame change
  stays smooth over a whole loop (2.9–5.4 mean per channel, no spikes at
  hand-overs). Render time is ~17 ms per frame at 512² and ~185 ms at 2048² (export).
- **Not like the plugin:** the plugin's clouds show slightly more fine internal
  texture. Ours are a little smoother inside.

### Phase 2 (2026-10-13)

- `shaders/aura.ts`: a smooth, morphing blob (its outline is noise sampled around
  the circle) at a fixed spot (`CENTER`), lit from the lower-left (`LIGHT`). The
  per-channel prism is per-channel offsets and widths: red widest and furthest out,
  green tight on the rim and leaking inside, blue between. Each is multiplied by
  that channel of the colour. That reproduces every recorded colour (pure red
  stays red; lime/orange/yellow get a green rim and red glow; violet a blue rim
  and magenta→red fringe).
- **Background:** composited with *lighten* (`max`), not add. That matches the
  recordings: on light grey only the brightest streaks show, on white nothing.
- **Fixed start (as the plugin):** `loopClock` now shifts its time circle so it
  passes through the origin at `t = 0`. The first frame is identical at any speed
  (unit-tested). Clouds are unaffected apart from that phase shift.
- **Lighting near the centre:** facing is `dot(v, L) / max(dist, radius)`, not
  `dot(dir, L)`. Direction alone is undefined at the centre and drew a wedge
  inside the blob.
- **Morph rate** matched by measurement: the plugin at speed 1 changes 0.38/255 per
  frame on average (1/30 s, 160² preview); ours 0.39 with `evolve: 1.6`. The loop
  seam is pixel-exact.
- **Speed:** ~4 ms per frame at 512², ~30 ms at 2048².
- **Not like the plugin:** its blob is a little more squarish and gently tilted,
  and at Detail 1 its glow is one solid flood. Ours keeps a soft rim and some
  structure. Its Detail 0.01 haze is slightly brighter.

### Phase 2, revision (2026-10-13): metaballs

The user rejected the first Aura: the plugin's blob is far more dynamic (lava lamp,
splitting and merging) and gains a 3D look at higher Detail; ours was "a static
hole". Contact sheets of the recordings at 2–4 fps confirmed it. At speed 1 the
plugin's shape changes completely within ~1 s, sprouts lobes and tails, pinches into
dumbbells, and at high Detail is shaded like a solid body lit from behind.

- **Rebuilt as metaballs:** 5 spheres in a smooth union (`smin`, k = 0.2),
  **ray-marched** orthographically (48 steps). The closest the ray passes to the
  surface gives the outside glow distance, so the prism glow still works.
- **Ball motion is computed on the CPU** once per frame (`auraBalls`, seeded
  `simplex-noise` 4D on the loop clock's circle) and passed as uniforms
  `u_b0..u_b4`, not computed per pixel. `ShaderTime` now carries `seed`.
- **Shading:** a Fresnel rim per channel (each channel reaching a different depth),
  a diffuse light from the lower-left front, and a faint sheen. `solid =
  smoothstep(0.05, 0.85, detail)` fades from a flat, dim shape to the lit 3D body,
  the gradual gain in dimension.
- Big, fast and gooey: main ball r ≈ 0.26, satellites r ≈ 0.16 reaching ±0.62,
  `EVOLVE = 1.5`. Detail grows the blob (×0.9 → ×1.15).
- The loop seam is pixel-exact; the first frame is the same at any speed. ~3 ms per
  frame at 512², ~25 ms at 2048².

## 9. Progress

- [x] Phase 0: Shader runtime
- [x] Phase 1: Clouds
- [ ] Phase 2: Aura (rebuilt as metaballs; awaiting the user's review)
- [ ] Phase 3: Polish
