# Research: Noise & Texture (Figma plugin) motion effects

Observations from screen recordings of the plugin's **Motion** tab (recorded 2026-10-13).
Only what was seen is written down; open questions are listed separately. Input for a
future plan to add these as generators.

## Shared panel structure

- Tabs: Pattern / Motion / Image. Motion has a row of effect thumbnails (Clouds, Aura, and ~10 others).
- "Effects +" header: effects appear to stack.
- Every effect ends with **Opacity** (slider) and **Blend** (dropdown).
  - Opacity 0 → effect fully transparent; mid → dimmed.
  - Blend options: Normal · Darken, Multiply, Plus darker, Color burn · Lighten, Screen, Plus lighter, Color dodge · Overlay, Soft light, Hard light · Difference, Exclusion · Hue, Saturation, Color, Luminosity. Default shown: Exclusion; with a single effect it looked identical to Normal.
- Speed 0 freezes the animation completely.
- Export → Download → Image (still image only). The "Options ▾ / Capture" bar seen at the end of
  recordings is the macOS screen-recording toolbar, not the plugin.
- Opacity fades the whole effect including its background (the panel shows through).

## Clouds

Look: soft, billowy fractal clouds over a sky. Motion: clouds drift sideways while their
edges keep evolving (not a rigid scroll).

| Control | Range | Default | Observed |
|---|---|---|---|
| Colors | 2 colours (with alpha) | white / black, both partly transparent | **Sky is a vertical gradient Colour 1 (top) → Colour 2 (bottom).** Clouds are drawn over it. |
| Speed | 0–1 | 0.20 | Drift/evolve speed; 0 = frozen. |
| Scale | 0–1 | 0 | Zoom in. 0 = many small clouds; ~0.75 = few large soft clouds; 1 = so zoomed that the frame is all cloud or all sky. |
| Light | 0–1 | 0.50 | Brightness of the clouds' lit parts. 1 = bright cream-white highlights; 0 = no highlights, clouds go flat and take on the sky/shadow colour. |
| Shadow | 0–1 | 0.50 | Darkness of the clouds' thick/shaded parts. 0 = clouds are flat, solid white (no shading); ~1 = dense parts go dark and smoky. |
| Tint | 0–1 | 0.60 | Colour of the shading. 0 = neutral grey shadows (grey/brown smoke over a coloured sky); 1 = shadows take the sky colour behind them (pink over red, orange over yellow). |
| Coverage | 0–1 | 0.28 | How much of the sky is cloud. Same cloud shapes grow outward with lacier edges as it rises; a moderate effect (0 still shows sizeable clouds). |
| Alpha | 0–1 | 1 | How hard the clouds are cut out of the sky. 1 = clouds with clear sky gaps; 0 = no cut-out: a soft mottled cloud texture covers the whole frame, sky gradient showing through. |

Combinations seen: Light 0 + Shadow 1 + Tint 1 → clouds become exactly the sky colour and vanish
(plain gradient). Light 0 + Shadow 0 → flat pure-white cloud shapes.

## Aura

Look: a dark, translucent, slowly morphing rounded blob on the background, back-lit by a
glow in the chosen colour. The glow is strongest along one edge and spills into a corner,
with fine streaky (smoke / long-exposure) texture and a thin bright rim along the blob's
outline. Motion: the blob morphs and floats, and the streaks ripple; no rotation or slide.

| Control | Range | Default | Observed |
|---|---|---|---|
| Background | colour + opacity % | 000000, 100% | Solid fill behind the glow. The glow behaves like **added light**: on white it vanishes completely; on light grey (DEDEDE, BABABA) only a faint pastel glow shows; on black it is at full strength. |
| Color | colour | 5000FF | See "Aura colour behaviour" below. |
| Speed | 0–1 | 1 (0.10 in 2nd clip) | Morph speed; 0 = frozen. |
| Detail | 0–1 | 0.49 | Biggest visual effect. 0.01 = near-empty dark violet haze; 0.49 = blob with soft streaky glow; 1 = sharper, larger blob and a strong solid glow filling a corner. |

### Aura colour behaviour

The glow is not a single flat colour: the colour's RGB channels separate across the glow.

| Colour set | Rim (tight to blob edge) | Outer glow / spill |
|---|---|---|
| FF0000 red | red | red (no other hues: a pure single-channel colour stays one hue) |
| FF00A2 pink | blue-violet tint in blob | pink/magenta |
| 3700FF / 5000FF violet | blue | magenta → red fringe |
| C800FF purple | blue | magenta |
| 00FF6E / 00FF7B green-cyan | cyan/teal | blue |
| 8CFF00 lime | green | red/orange |
| FFA200 orange, FFC800 yellow | green | red |

Pattern: where the colour has a red component, red spreads furthest out into the glow;
green stays tightest on the rim; blue sits between. A colour with only one channel (pure
red) shows just that hue. The blob interior carries a faint tint of the colour.

## Open questions

None left for Clouds or Aura. Aura always starts from the same blob in the lower-left (confirmed by the user); we emulate that.
