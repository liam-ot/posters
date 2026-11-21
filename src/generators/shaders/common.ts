import { parseColor } from '../../svg/color'
import type { UniformValue } from '../gl'

type Params = Record<string, number | string | boolean>

/** Render time: `t` in seconds, the loop length it must repeat over, and the layer's seed. */
export interface ShaderTime {
  t: number
  loopSec: number
  seed: number
}

/** A generator drawn by a fragment shader (docs/plans/motion-generators.md). */
export interface ShaderGenerator {
  frag: string
  /** Loop rates for `loopClock`: tiles per second of drift and noise units per second of evolution, at speed 1. */
  rates: { drift: number; evolve: number }
  /** Uniforms from the layer's params (merged with defaults) and the render time. */
  uniforms: (p: Params, time: ShaderTime) => Record<string, UniformValue>
  /** Flat fill used when WebGL is unavailable. */
  fallback: (p: Params) => string
}

/**
 * Shared GLSL header. `uv` is 0..1 with y pointing **down**, like the canvas, so
 * "top" in a shader means the top of the layer.
 */
export const GLSL_HEAD = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_phase; // 0..1 through the loop
uniform float u_drift; // tiles drifted; whole number at the loop point
uniform vec2 u_evo;    // point on a circle in noise space (evolution)
uniform float u_seed;  // 0..1
vec2 screenUv() { return vec2(v_uv.x, 1.0 - v_uv.y); }
`

/** A CSS colour as a straight-alpha vec4 (0..1). */
export function colorVec(css: string): [number, number, number, number] {
  const c = parseColor(css) ?? { r: 0, g: 0, b: 0, a: 1 }
  return [c.r / 255, c.g / 255, c.b / 255, c.a]
}

/**
 * GLSL noise: 4D value noise (2 space + 2 time dimensions, so time can run on a
 * circle and loop exactly) hashed with pcg4d (Jarzynski & Olano, "Hash Functions
 * for GPU Rendering", 2020).
 */
export const GLSL_NOISE = `
uvec4 pcg4d(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}
float hash4(vec4 cell) {
  // Offset keeps lattice coordinates positive before the uint conversion.
  return float(pcg4d(uvec4(ivec4(cell) + 65536)).x) * (1.0 / 4294967295.0);
}
// 0..1, smooth (quintic) interpolation between 16 lattice corners.
float vnoise4(vec4 p) {
  vec4 i = floor(p);
  vec4 f = fract(p);
  vec4 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float r = 0.0;
  for (int k = 0; k < 16; k++) {
    vec4 o = vec4(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1), float((k >> 3) & 1));
    vec4 w = mix(1.0 - u, u, o);
    r += w.x * w.y * w.z * w.w * hash4(i + o);
  }
  return r;
}
`
