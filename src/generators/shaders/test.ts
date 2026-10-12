// TEMPORARY (Phase 0 of docs/plans/motion-generators.md): proves the shader
// runtime end to end. Remove in Phase 3.
import { GLSL_HEAD, colorVec, type ShaderGenerator } from './common'

const frag = `${GLSL_HEAD}
uniform vec4 u_colorA;
uniform vec4 u_colorB;
void main() {
  vec2 uv = screenUv();
  // Bands drift sideways (whole tiles per loop) and ripple with the time circle.
  float bands = 0.5 + 0.5 * sin(6.2831853 * (uv.x * 2.0 - u_drift));
  float ripple = 0.5 + 0.5 * sin(u_evo.x * 4.0 + uv.y * 6.2831853);
  outColor = mix(u_colorA, u_colorB, bands * mix(0.4, 1.0, ripple));
}`

export const shaderTest: ShaderGenerator = {
  frag,
  rates: { drift: 0.5, evolve: 1 },
  uniforms: (p) => ({
    u_colorA: colorVec(p.colorA as string),
    u_colorB: colorVec(p.colorB as string),
  }),
  fallback: (p) => p.colorA as string,
}
