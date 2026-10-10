// CSS colour parsing/formatting for SVG import. The browser resolves styles to
// rgb()/rgba() for us (getComputedStyle), so this only needs the forms a
// computed value or an authored hex colour can take.

export interface RGBA {
  r: number // 0..255
  g: number
  b: number
  a: number // 0..1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const byte = (v: number) => clamp(Math.round(v), 0, 255)

function channel(token: string): number {
  return token.endsWith('%') ? (parseFloat(token) / 100) * 255 : parseFloat(token)
}

function alphaOf(token: string | undefined): number {
  if (token === undefined || token === '') return 1
  const a = token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token)
  return Number.isFinite(a) ? clamp(a, 0, 1) : 1
}

/** Parse hex, rgb()/rgba() (comma or space syntax) and `transparent`. */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase()
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  if (s.startsWith('#')) {
    const h = s.slice(1)
    if (!/^[0-9a-f]+$/.test(h)) return null
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split('').map((c) => parseInt(c + c, 16))
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 }
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }

  const m = s.match(/^rgba?\(([^)]*)\)$/)
  if (!m) return null
  const parts = m[1].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 4) return null
  const [r, g, b] = parts.slice(0, 3).map(channel)
  if (![r, g, b].every(Number.isFinite)) return null
  return { r: byte(r), g: byte(g), b: byte(b), a: alphaOf(parts[3]) }
}

const hex2 = (v: number) => byte(v).toString(16).padStart(2, '0')

/** `#rrggbb`, or `#rrggbbaa` when not fully opaque (Konva reads both). */
export function formatColor({ r, g, b, a }: RGBA): string {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`
  return a >= 1 ? base : base + hex2(a * 255)
}

/** Multiply a colour's alpha (fill-opacity, stop-opacity…). Unparseable input is returned as is. */
export function withAlpha(color: string, factor: number): string {
  const c = parseColor(color)
  if (!c) return color
  return formatColor({ ...c, a: clamp(c.a * factor, 0, 1) })
}

/** Opaque `#rrggbb` of a colour — the identity used for palette swatches. */
export function rgbHex(color: string): string | null {
  const c = parseColor(color)
  return c ? formatColor({ ...c, a: 1 }) : null
}

/** Swap a colour's RGB for `hex` while keeping its own alpha. */
export function replaceRgb(color: string, hex: string): string {
  const from = parseColor(color)
  const to = parseColor(hex)
  if (!from || !to) return color
  return formatColor({ ...to, a: from.a })
}
