// Aura, after the Motion → Aura effect of the Figma plugin Noise & Texture: a dark,
// lava-lamp blob back-lit by a streaky glow. What each control does is from screen
// recordings: docs/plans/noise-texture-motions-research.md.
//
// The blob is metaballs: a few spheres drift independently and melt together
// where they meet (a smooth union), so it bulges, sprouts tails, splits and merges.
// It's ray-marched in 3D so higher Detail can light it as a solid body.
import { createNoise4D } from 'simplex-noise'
import { mulberry32 } from '../util'
import { loopClock } from '../loopTime'
import { GLSL_HEAD, GLSL_NOISE, colorVec, type ShaderGenerator } from './common'

const BALLS = 5
// Noise units per second of ball motion at speed 1 (tuned against the recordings).
const EVOLVE = 1.5

const frag = `${GLSL_HEAD}
${GLSL_NOISE}
uniform vec4 u_bg;
uniform vec3 u_color;
uniform float u_detail;
uniform vec4 u_b0, u_b1, u_b2, u_b3, u_b4; // ball centre (xyz) and radius (w)

// The light sits behind the blob, towards the lower-left (y down), as in the plugin.
const vec2 LIGHT = vec2(-0.75, 0.66);

float sn(vec4 p) { return vnoise4(p) * 2.0 - 1.0; }

// Polynomial smooth minimum (Quilez): blends the spheres into one surface.
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float ball(vec3 p, vec4 b) { return length(p - b.xyz) - b.w; }
float scene(vec3 p) {
  const float K = 0.2;
  float d = ball(p, u_b0);
  d = smin(d, ball(p, u_b1), K);
  d = smin(d, ball(p, u_b2), K);
  d = smin(d, ball(p, u_b3), K);
  return smin(d, ball(p, u_b4), K);
}
vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.002, -0.002);
  return normalize(e.xyy * scene(p + e.xyy) + e.yyx * scene(p + e.yyx)
                 + e.yxy * scene(p + e.yxy) + e.xxx * scene(p + e.xxx));
}

void main() {
  vec2 uv = screenUv();
  // Square units centred on the frame, so the blob stays round on any aspect.
  vec2 q = (uv - 0.5) * u_res / min(u_res.x, u_res.y) + 0.5;
  vec2 L = normalize(LIGHT);

  // Orthographic ray straight into the screen. Track how close it passes to the
  // surface: outside the blob, that is the distance for the glow.
  vec3 ro = vec3(q, 1.0);
  float t = 0.0, near = 1e3;
  bool hit = false;
  for (int i = 0; i < 48; i++) {
    float d = scene(ro + vec3(0.0, 0.0, -t));
    near = min(near, d);
    if (d < 0.0015) { hit = true; break; }
    t += max(d, 0.004);
    if (t > 2.0) break;
  }
  vec3 n = hit ? normalAt(ro + vec3(0.0, 0.0, -t)) : vec3(0.0, 0.0, 1.0);
  vec2 nxy = normalize(n.xy + 1e-5);
  float d = hit ? 0.0 : near;

  // Facing the light: by surface normal on the body, by position just outside it.
  vec2 c = (u_b0.xy + u_b1.xy + u_b2.xy + u_b3.xy + u_b4.xy) / 5.0;
  vec2 v = q - c;
  float facing = hit ? dot(nxy, L) : dot(v, L) / max(length(v), 0.25);
  float glowLit = pow(smoothstep(-0.1, 1.0, facing), 2.0);

  // Smoke with long-exposure streaks running towards the lower-left corner.
  float along = dot(v, L);
  float across = dot(v, vec2(-L.y, L.x));
  float smoke = 0.5 + 0.5 * sn(vec4(q * 3.0, u_evo.yx * 0.8));
  float bend = 0.08 * sn(vec4(q * 2.2 + 3.0, u_evo * 0.5));
  float rays = 0.5 + 0.5 * sn(vec4((across + bend) * 30.0, along * 2.0, u_evo * 0.7));
  rays = mix(rays, 0.5 + 0.5 * sn(vec4((across - bend) * 55.0, along * 3.0, u_evo.yx)), 0.4);
  float streakAmt = 0.25 + 0.6 * u_detail * (1.0 - 0.6 * u_detail);
  float streak = mix(1.0, (0.4 + 1.2 * rays) * (0.55 + smoke), streakAmt);

  // Detail: from a dim, blurry haze (0) to a sharp, solid, lit body (1).
  float blur = mix(3.0, 1.0, sqrt(u_detail));
  float glowAmt = 0.2 + 2.6 * pow(u_detail, 1.3);
  float solid = smoothstep(0.05, 0.85, u_detail);

  // Glow around the silhouette, split like a prism: red widest and furthest out,
  // green tight on the rim, blue between.
  vec3 shift = vec3(0.012, -0.01, 0.0);
  vec3 width = vec3(0.2, 0.05, 0.11) * blur;
  vec3 glow = vec3(0.0);
  if (!hit) {
    for (int i = 0; i < 3; i++) {
      float dd = max(d - shift[i], 0.0);
      glow[i] = glowLit * glowAmt * exp(-dd / width[i]) * streak;
    }
  } else {
    // Back-lit body: a Fresnel rim (bright where the surface turns away from us),
    // brightest on the side facing the light, with each channel reaching a
    // different depth (green deepest, red only at the very edge).
    float edge = 1.0 - n.z;
    float side = 0.15 + 0.85 * smoothstep(-0.5, 0.9, facing);
    vec3 rimPow = mix(vec3(10.0, 2.2, 3.5), vec3(14.0, 3.0, 5.0), solid);
    vec3 rim = pow(vec3(edge), rimPow) * side * (0.5 + 1.6 * solid);
    // The same light also falls across the front of the body: it shades from lit
    // (lower-left) to dark, which gives the blob its volume. Plus a faint sheen.
    float diffuse = pow(max(dot(n, normalize(vec3(L, 0.55))), 0.0), 1.6);
    float sheen = pow(max(dot(n, normalize(vec3(-L * 0.4, 1.0))), 0.0), 24.0);
    vec3 body = vec3(0.05) + rim + vec3(0.45, 0.7, 0.85) * diffuse * solid + 0.12 * sheen * solid;
    // At low Detail the body is a flat, dim shape: the dimension fades in with Detail.
    glow = mix(vec3(0.05 + 0.1 * edge), body, 0.3 + 0.7 * solid);
    // Where the body meets the glow, blend so the edge isn't a hard cut.
    glow += glowLit * glowAmt * vec3(1.0) * pow(edge, 6.0) * 0.5;
  }
  vec3 light = clamp(u_color * glow, 0.0, 1.0);

  // Lighten over the background: on black it shows fully, on light grey only its
  // brightest streaks, on white not at all (as recorded). Straight alpha out.
  vec3 premult = max(u_bg.rgb * u_bg.a, light);
  float a = max(u_bg.a, max(light.r, max(light.g, light.b)));
  outColor = a > 0.0 ? vec4(clamp(premult / a, 0.0, 1.0), a) : vec4(0.0);
}`

const noises = new Map<number, ReturnType<typeof createNoise4D>>()
function noiseFor(seed: number) {
  let n = noises.get(seed)
  if (!n) {
    n = createNoise4D(mulberry32(seed))
    noises.set(seed, n)
  }
  return n
}

/**
 * Ball centres and radii at a moment, from loop-safe time (so the motion loops
 * exactly), computed once per frame here rather than per pixel in the shader.
 * The first ball is the big body; the others drift around it and can break away.
 * Detail grows the blob, as recorded.
 */
export function auraBalls(evo: [number, number], seed: number, detail: number): number[][] {
  const noise = noiseFor(seed)
  // Offsets keep samples off simplex lattice ties (see animation/noise.ts).
  const at = (k: number, ch: number) => noise(k * 3.17 + 0.123, ch * 5.31 + 0.456, evo[0], evo[1])
  const grow = 0.9 + 0.25 * detail
  const balls: number[][] = []
  for (let i = 0; i < BALLS; i++) {
    const main = i === 0
    const reach = main ? 0.15 : 0.62
    balls.push([
      0.55 + reach * at(i, 0),
      0.42 + reach * 0.85 * at(i, 1),
      0.12 * at(i, 2),
      grow * (main ? 0.26 + 0.04 * at(i, 3) : 0.16 + 0.07 * at(i, 3)),
    ])
  }
  return balls
}

export const aura: ShaderGenerator = {
  frag,
  rates: { drift: 0, evolve: EVOLVE },
  uniforms: (p, { t, loopSec, seed }) => {
    const detail = Number(p.detail)
    const { evo } = loopClock(t, loopSec, Number(p.speed), { drift: 0, evolve: EVOLVE })
    const balls = auraBalls(evo, seed, detail)
    return {
      u_bg: colorVec(p.background as string),
      u_color: colorVec(p.color as string).slice(0, 3),
      u_detail: detail,
      ...Object.fromEntries(balls.map((b, i) => [`u_b${i}`, b])),
    }
  },
  fallback: (p) => p.background as string,
}
