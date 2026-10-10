// Sanitise untrusted SVG *before* it ever touches the live DOM (docs/adr/0008).
// Rules are pure functions (unit tested); `sanitizeSvg` applies them to a
// detached document parsed with DOMParser — scripts never run there.

export const SVG_NS = 'http://www.w3.org/2000/svg'

/** What was removed, by category → count. Surfaced to the user as warnings. */
export type Notes = Map<string, number>
export const note = (notes: Notes, key: string, by = 1) => notes.set(key, (notes.get(key) ?? 0) + by)

/** Elements that can run code, load content or are not part of SVG drawing. */
const BLOCKED_TAGS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'embed',
  'object',
  'audio',
  'video',
  'canvas',
  'link',
  'meta',
  'base',
  'handler',
])

/** SMIL animation: unsupported, and `<set attributeName="href">` can rewrite links. */
const ANIMATION_TAGS = new Set(['animate', 'animatetransform', 'animatemotion', 'set', 'discard'])

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/i

/** Only same-document references (`#id`) are allowed, plus small raster data URLs on <image>. */
export function isSafeHref(value: string, tag: string): boolean {
  const v = value.trim()
  if (v.startsWith('#')) return true
  return tag === 'image' && DATA_IMAGE.test(v)
}

/**
 * Neutralise external references in CSS (`<style>` text or a `style` attribute):
 * `@import` is dropped and any `url()` that is not a `#fragment` becomes `none`.
 */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none')
    .replace(/expression\s*\([^)]*\)/gi, 'none')
}

const isEventHandler = (name: string) => /^on/i.test(name)
const isHref = (name: string) => name === 'href' || name === 'xlink:href' || name.endsWith(':href')

export class SvgParseError extends Error {}

function walk(el: Element, notes: Notes) {
  for (const child of Array.from(el.children)) {
    const tag = child.localName.toLowerCase()

    // Anything outside the SVG namespace (inline HTML, editor metadata) goes.
    if (child.namespaceURI !== SVG_NS) {
      child.remove()
      if (tag === 'foreignobject' || /^(html|body|iframe|script)$/.test(tag)) note(notes, 'foreignObject')
      continue
    }
    if (BLOCKED_TAGS.has(tag)) {
      child.remove()
      note(notes, tag === 'script' ? 'script' : tag === 'foreignobject' ? 'foreignObject' : `<${tag}>`)
      continue
    }
    if (ANIMATION_TAGS.has(tag)) {
      child.remove()
      note(notes, 'animation')
      continue
    }

    for (const attr of Array.from(child.attributes)) {
      const name = attr.name
      if (isEventHandler(name)) {
        child.removeAttribute(name)
        note(notes, 'event handler')
      } else if (isHref(name)) {
        if (!isSafeHref(attr.value, tag)) {
          child.removeAttribute(name)
          note(notes, 'external reference')
        }
      } else if (name === 'style') {
        const clean = sanitizeCss(attr.value)
        if (clean !== attr.value) note(notes, 'external reference')
        child.setAttribute('style', clean)
      } else if (/javascript:/i.test(attr.value) || name === 'src') {
        child.removeAttribute(name)
        note(notes, 'external reference')
      }
    }

    if (tag === 'style') {
      const css = child.textContent ?? ''
      const clean = sanitizeCss(css)
      if (clean !== css) {
        note(notes, 'external reference')
        child.textContent = clean
      }
    }

    walk(child, notes)
  }
}

export interface Sanitized {
  svg: string // serialised, safe to mount
  notes: Notes
}

/** Parse + clean an SVG file's text. Throws SvgParseError if it isn't a usable SVG. */
export function sanitizeSvg(text: string): Sanitized {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || doc.querySelector('parsererror') || root.localName !== 'svg') {
    throw new SvgParseError('This file isn’t a valid SVG.')
  }
  const notes: Notes = new Map()
  // The root itself can carry handlers too (e.g. <svg onload="…">).
  for (const attr of Array.from(root.attributes)) {
    if (isEventHandler(attr.name) || /javascript:/i.test(attr.value)) {
      root.removeAttribute(attr.name)
      note(notes, 'event handler')
    }
  }
  walk(root, notes)
  return { svg: new XMLSerializer().serializeToString(root), notes }
}
