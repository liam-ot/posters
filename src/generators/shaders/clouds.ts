// Clouds, after the Motion → Clouds effect of the Figma plugin Noise & Texture.
// What each control does is from screen recordings:
// docs/plans/noise-texture-motions-research.md.
import { crossfadeDrift } from '../loopTime'
import { GLSL_HEAD, GLSL_NOISE, colorVec, type ShaderGenerator } from './common'

// Measured from the recordings: at speed 1 the clouds move left and a little
// down, ~0.22 / 0.09 of the frame per second (units: the frame's shorter side).
const VELOCITY: [number, number] = [-0.22, 0.09]
// Drift per hand-over between the two drifting copies (see crossfadeDrift): long, so
// hand-overs are rare and the clouds mostly slide, as in the plugin.
const MAX_SHIFT = 1.0

const frag = `${GLSL_HEAD}
${GLSL_NOISE}
uniform vec4 u_colorA;   // sky, top
uniform vec4 u_colorB;   // sky, bottom
uniform vec2 u_offA;
uniform vec2 u_offB;
uniform float u_wA;
uniform float u_scale;   // noise units per frame (shorter side)
uniform float u_base;    // cloud brightness before detail (from Shadow)
uniform float u_detail;  // brightness added by detail (from Light)
uniform float u_tint;
uniform float u_cover;
uniform float u_cut;     // how hard the clouds are cut out of the sky (from Alpha)

// Rotate + double: each octave is finer and turned so the noise grid doesn't line up.
const mat2 OCT = mat2(1.6, 1.2, -1.2, 1.6);

float sn(vec2 p, vec2 e) { return vnoise4(vec4(p, e)) * 2.0 - 1.0; }

// Cloud fields at a point: x = body (soft fBm × ridged fBm, gives billows with
// ragged, lacy edges), y = detail (finer fBm + ridges) used for brightness and wisps.
vec2 fields(vec2 p) {
  vec2 e = u_evo;
  // Large-scale warp makes the shapes flow instead of sitting on a grid.
  float warp = 0.0, w = 0.1;
  vec2 x = p * 0.5;
  for (int i = 0; i < 6; i++) { warp += w * sn(x, e); x = OCT * x; w *= 0.4; }

  float ridged = 0.0; w = 0.8; x = p - warp;
  for (int i = 0; i < 7; i++) { ridged += abs(w * sn(x, e * 1.3)); x = OCT * x; w *= 0.7; }
  float body = 0.0; w = 0.7; x = p - warp;
  for (int i = 0; i < 7; i++) { body += w * sn(x, e * 1.3); x = OCT * x; w *= 0.6; }
  body *= ridged + body;

  float detail = 0.0; w = 0.4; x = p * 2.0 - warp;
  for (int i = 0; i < 6; i++) { detail += w * sn(x, e * 2.0); x = OCT * x; w *= 0.6; }
  float ridges = 0.0; w = 0.4; x = p * 3.0 - warp;
  for (int i = 0; i < 6; i++) { ridges += abs(w * sn(x, e * 2.6)); x = OCT * x; w *= 0.6; }
  return vec2(body * ridged, detail + ridges);
}

void main() {
  vec2 uv = screenUv();
  vec2 q = uv * u_res / min(u_res.x, u_res.y);
  vec2 seed = vec2(u_seed * 113.0, u_seed * 71.0);

  // Two drifting copies, cross-faded (crossfadeDrift). Copy B samples elsewhere.
  vec2 a = fields((q - u_offA) * u_scale + seed);
  vec2 b = fields((q - u_offB) * u_scale + seed + vec2(41.7, 23.9));
  vec2 f = a * u_wA + b * (1.0 - u_wA);

  vec4 sky = mix(u_colorA, u_colorB, uv.y);
  vec3 cloudCol = vec3(1.08, 1.06, 1.0) * clamp(u_base + u_detail * f.y, 0.0, 1.0);
  // Tint lets the sky colour into the clouds (pink over red, pale over yellow).
  vec3 cloud = clamp(u_tint * sky.rgb + cloudCol, 0.0, 1.0);
  float m = clamp(u_cover + u_cut * f.x + f.y, 0.0, 1.0);

  // Clouds over the sky, straight alpha.
  float alpha = sky.a + m * (1.0 - sky.a);
  vec3 rgb = alpha > 0.0 ? (sky.rgb * sky.a * (1.0 - m) + cloud * m) / alpha : vec3(0.0);
  outColor = vec4(rgb, alpha);
}`

export const clouds: ShaderGenerator = {
  frag,
  rates: { drift: 0, evolve: 0.12 },
  uniforms: (p, { t, loopSec }) => {
    const drift = crossfadeDrift(t, loopSec, Number(p.speed), VELOCITY, MAX_SHIFT)
    const scale = Number(p.scale)
    return {
      u_colorA: colorVec(p.colorA as string),
      u_colorB: colorVec(p.colorB as string),
      u_offA: drift.offA,
      u_offB: drift.offB,
      u_wA: drift.wA,
      // Scale zooms in: many small clouds at 0, one cloud filling the frame at 1.
      u_scale: 1.6 * Math.pow(0.08, scale),
      // Steep: mid Shadow is already dark grey (Tint 0 shows charcoal clouds), 0 is pure white.
      u_base: (1 - Number(p.shadow)) ** 1.5,
      u_detail: Number(p.light) * 0.6,
      u_tint: Number(p.tint),
      u_cover: Number(p.coverage) * 0.6 - 0.25,
      u_cut: Number(p.alpha) * 14,
    }
  },
  fallback: (p) => p.colorB as string,
}
