// One shared offscreen WebGL2 context for every shader generator. Browsers cap
// live contexts (~16), so layers never get their own: each render draws here and
// the caller copies the result into its layer's 2D canvas straight away.

export type UniformValue = number | readonly number[]

const VERT = `#version 300 es
// One triangle covering the screen; no vertex buffers needed.
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 v_uv;
void main() {
  vec2 p = P[gl_VertexID];
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`

interface Program {
  program: WebGLProgram
  locations: Map<string, WebGLUniformLocation | null>
}

let canvas: HTMLCanvasElement | null = null
let gl: WebGL2RenderingContext | null = null
let vao: WebGLVertexArrayObject | null = null
let unavailable = false
// Keyed by fragment source; cleared when the context is lost.
const programs = new Map<string, Program | null>()

function context(): WebGL2RenderingContext | null {
  if (unavailable) return null
  if (gl) return gl.isContextLost() ? null : gl
  canvas = document.createElement('canvas')
  // Straight (non-premultiplied) alpha: shaders output plain colour + alpha, and
  // drawImage converts when copying to 2D. preserveDrawingBuffer keeps the pixels
  // readable after the draw call.
  gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: false,
    depth: false,
    stencil: false,
  })
  if (!gl) {
    unavailable = true
    console.warn('WebGL2 unavailable: shader generators fall back to a flat fill.')
    return null
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault() // allow a restore
    programs.clear()
    vao = null
  })
  return gl
}

function compile(g: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = g.createShader(type)
  if (!s) return null
  g.shaderSource(s, src)
  g.compileShader(s)
  if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
    console.error('Shader compile failed:\n' + g.getShaderInfoLog(s))
    g.deleteShader(s)
    return null
  }
  return s
}

function programFor(g: WebGL2RenderingContext, frag: string): Program | null {
  if (programs.has(frag)) return programs.get(frag)!
  let result: Program | null = null
  const vs = compile(g, g.VERTEX_SHADER, VERT)
  const fs = compile(g, g.FRAGMENT_SHADER, frag)
  if (vs && fs) {
    const program = g.createProgram()!
    g.attachShader(program, vs)
    g.attachShader(program, fs)
    g.linkProgram(program)
    if (g.getProgramParameter(program, g.LINK_STATUS)) {
      result = { program, locations: new Map() }
    } else {
      console.error('Shader link failed:\n' + g.getProgramInfoLog(program))
    }
  }
  // A broken shader is cached as null so it doesn't recompile (and log) every frame.
  programs.set(frag, result)
  return result
}

function setUniform(g: WebGL2RenderingContext, p: Program, name: string, v: UniformValue) {
  let loc = p.locations.get(name)
  if (loc === undefined) {
    loc = g.getUniformLocation(p.program, name)
    p.locations.set(name, loc)
  }
  if (!loc) return // unused uniforms are compiled out
  if (typeof v === 'number') g.uniform1f(loc, v)
  else if (v.length === 2) g.uniform2f(loc, v[0], v[1])
  else if (v.length === 3) g.uniform3f(loc, v[0], v[1], v[2])
  else if (v.length === 4) g.uniform4f(loc, v[0], v[1], v[2], v[3])
}

/**
 * Draw a fragment shader at w×h and return the shared canvas holding the result
 * (valid until the next call), or null without WebGL or if the shader fails.
 */
export function renderShader(
  frag: string,
  w: number,
  h: number,
  uniforms: Record<string, UniformValue>,
): HTMLCanvasElement | null {
  const g = context()
  if (!g) return null
  const p = programFor(g, frag)
  if (!p) return null
  if (canvas!.width !== w) canvas!.width = w
  if (canvas!.height !== h) canvas!.height = h
  if (!vao) vao = g.createVertexArray()
  g.viewport(0, 0, w, h)
  g.useProgram(p.program)
  g.bindVertexArray(vao)
  setUniform(g, p, 'u_res', [w, h])
  for (const [name, v] of Object.entries(uniforms)) setUniform(g, p, name, v)
  g.drawArrays(g.TRIANGLES, 0, 3)
  return canvas
}
