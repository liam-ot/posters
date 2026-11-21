// Turn a sanitised SVG into VectorPaths using the *browser* to resolve styles and
// transforms (docs/adr/0008): mount it in a hidden, style-isolated iframe, read
// getComputedStyle for paint/stroke and getScreenCTM for geometry. This avoids
// re-implementing the CSS cascade (Illustrator exports rely on <style> classes).
import type { Matrix2D, Paint, VectorPath } from '../types/poster'
import { formatColor, parseColor } from './color'
import { resolveGradient } from './gradient'
import { SVG_NS, SvgParseError, note, sanitizeSvg, type Notes } from './sanitize'
import { circlePath, ellipseShapePath, linePath, parseDashArray, polyPath, rectPath } from './shapes'

export { SvgParseError }

export interface SvgImport {
  name: string
  viewBox: { x: number; y: number; width: number; height: number }
  paths: VectorPath[]
  /** Sanitised source text. */
  sourceSvg: string
  warnings: string[]
}

const CONTAINERS = new Set(['g', 'a', 'switch', 'svg'])
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
const MAX_USE_DEPTH = 12

/** Display wording for the importer's notes. */
const LABELS: Record<string, string> = {
  script: 'script (removed for safety)',
  foreignObject: 'foreignObject (removed for safety)',
  'event handler': 'event handler (removed for safety)',
  'external reference': 'external link (removed for safety)',
  animation: 'animation (ignored)',
  filter: 'filter (ignored)',
  mask: 'mask (ignored)',
  'clip-path': 'clip-path (ignored)',
  text: 'text (skipped)',
  'embedded image': 'embedded image (skipped)',
  marker: 'marker (ignored)',
  'pattern fill': 'pattern fill (skipped)',
}

export function formatNotes(notes: Notes): string[] {
  return [...notes].map(([key, count]) => `${count}× ${LABELS[key] ?? key}`)
}

// ── hidden host ────────────────────────────────────────────────────────────

interface Host {
  idoc: Document
  win: Window
  root: SVGSVGElement
}

/**
 * Run `fn` with the SVG mounted in an off-screen iframe. The iframe gives the SVG
 * its own document, so its <style> rules can't leak into the app (or the app's
 * Tailwind reset into its computed styles). `visibility:hidden` keeps layout
 * alive — `display:none` would make getScreenCTM() return null.
 */
function withHost<T>(svgText: string, fn: (host: Host) => T): T {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-same-origin') // no scripts, ever
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:2000px;height:2000px;border:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(iframe)
  try {
    const idoc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!idoc || !win) throw new SvgParseError('Could not prepare the SVG for import.')
    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml')
    const root = idoc.importNode(parsed.documentElement, true) as unknown as SVGSVGElement
    idoc.body.style.margin = '0'
    idoc.body.appendChild(root)
    return fn({ idoc, win, root })
  } finally {
    iframe.remove()
  }
}

// ── <use> expansion ────────────────────────────────────────────────────────

/** Replace each <use> with a <g> holding a clone of its target (the browser doesn't expose use shadow trees). */
function expandUses(root: Element, idoc: Document, notes: Notes) {
  for (let depth = 0; depth < MAX_USE_DEPTH; depth++) {
    const uses = Array.from(root.querySelectorAll('use'))
    if (uses.length === 0) return
    for (const use of uses) {
      const ref = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? ''
      const target = ref.startsWith('#') ? idoc.getElementById(ref.slice(1)) : null
      const g = idoc.createElementNS(SVG_NS, 'g')
      // The <use> element's own presentation attributes style the clone.
      for (const attr of Array.from(use.attributes)) {
        if (!/^(href|xlink:href|x|y|width|height|id|transform)$/.test(attr.name)) g.setAttribute(attr.name, attr.value)
      }
      const x = parseFloat(use.getAttribute('x') ?? '0') || 0
      const y = parseFloat(use.getAttribute('y') ?? '0') || 0
      g.setAttribute('transform', `${use.getAttribute('transform') ?? ''} translate(${x} ${y})`.trim())
      // A clone that still contains this <use> would never terminate; depth caps cycles.
      if (target && !target.contains(use)) {
        const clone = target.cloneNode(true) as Element
        clone.removeAttribute('id')
        if (clone.localName === 'symbol' || clone.localName === 'svg') {
          const inner = idoc.createElementNS(SVG_NS, 'g')
          while (clone.firstChild) inner.appendChild(clone.firstChild)
          g.appendChild(inner)
        } else {
          g.appendChild(clone)
        }
      } else {
        note(notes, 'unresolved <use>')
      }
      use.replaceWith(g)
    }
  }
  if (root.querySelector('use')) {
    root.querySelectorAll('use').forEach((u) => u.remove())
    note(notes, 'recursive <use>')
  }
}

// ── geometry + style ───────────────────────────────────────────────────────

function elementPath(el: Element): string {
  switch (el.localName) {
    case 'path':
      return el.getAttribute('d') ?? ''
    case 'rect': {
      const r = el as SVGRectElement
      return rectPath(r.x.baseVal.value, r.y.baseVal.value, r.width.baseVal.value, r.height.baseVal.value, r.rx.baseVal.value, r.ry.baseVal.value)
    }
    case 'circle': {
      const c = el as SVGCircleElement
      return circlePath(c.cx.baseVal.value, c.cy.baseVal.value, c.r.baseVal.value)
    }
    case 'ellipse': {
      const e = el as SVGEllipseElement
      return ellipseShapePath(e.cx.baseVal.value, e.cy.baseVal.value, e.rx.baseVal.value, e.ry.baseVal.value)
    }
    case 'line': {
      const l = el as SVGLineElement
      return linePath(l.x1.baseVal.value, l.y1.baseVal.value, l.x2.baseVal.value, l.y2.baseVal.value)
    }
    default: {
      const p = el as SVGPolylineElement
      const pts: [number, number][] = []
      for (let i = 0; i < p.points.numberOfItems; i++) pts.push([p.points.getItem(i).x, p.points.getItem(i).y])
      return polyPath(pts, el.localName === 'polygon')
    }
  }
}

function relativeMatrix(el: SVGGraphicsElement, inverseRoot: DOMMatrix): Matrix2D | null {
  const ctm = el.getScreenCTM()
  if (!ctm) return null
  const m = inverseRoot.multiply(ctm)
  return [m.a, m.b, m.c, m.d, m.e, m.f]
}

const num = (v: string, fallback: number) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function readViewBox(root: SVGSVGElement): SvgImport['viewBox'] {
  const vb = root.viewBox.baseVal
  if (vb && vb.width > 0 && vb.height > 0) return { x: vb.x, y: vb.y, width: vb.width, height: vb.height }
  const attr = (n: string) => {
    const v = root.getAttribute(n)
    return v && !v.trim().endsWith('%') ? parseFloat(v) : NaN
  }
  const w = attr('width')
  const h = attr('height')
  if (w > 0 && h > 0) return { x: 0, y: 0, width: w, height: h }
  const b = root.getBBox()
  if (b.width > 0 && b.height > 0) return { x: b.x, y: b.y, width: b.width, height: b.height }
  throw new SvgParseError('This SVG has no size (no viewBox, width/height or drawable content).')
}

/** Parse a sanitised SVG into VectorPaths. */
export function parseSvg(sanitized: string, notes: Notes): Omit<SvgImport, 'name' | 'sourceSvg' | 'warnings'> {
  return withHost(sanitized, ({ idoc, win, root }) => {
    const viewBox = readViewBox(root)
    // Render 1:1 so the viewBox maps to itself (no letterboxing from aspect-ratio rules).
    root.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`)
    root.setAttribute('width', String(viewBox.width))
    root.setAttribute('height', String(viewBox.height))
    root.setAttribute('preserveAspectRatio', 'none')
    root.removeAttribute('style')

    expandUses(root, idoc, notes)

    // A marker as a direct child of the root: inverse(marker CTM) × element CTM
    // maps an element's local space into viewBox space, whatever the root does.
    const marker = idoc.createElementNS(SVG_NS, 'g')
    root.insertBefore(marker, root.firstChild)
    const markerCtm = (marker as SVGGElement).getScreenCTM()
    if (!markerCtm) throw new SvgParseError('Could not lay out the SVG.')
    const inverseRoot = markerCtm.inverse()

    const paths: VectorPath[] = []

    const paint = (kind: 'fill' | 'stroke', el: SVGGraphicsElement, cs: CSSStyleDeclaration): Paint | null => {
      const raw = (kind === 'fill' ? cs.fill : cs.stroke).trim()
      if (!raw || raw === 'none') return null
      const opacity = num(kind === 'fill' ? cs.fillOpacity : cs.strokeOpacity, 1)

      const url = raw.match(/^url\(\s*(['"]?)#([^'")]+)\1\s*\)\s*(.*)$/)
      if (url) {
        const bb = el.getBBox()
        const res = resolveGradient(url[2], {
          idoc,
          win,
          bbox: { x: bb.x, y: bb.y, width: bb.width, height: bb.height },
          viewBox,
          opacity,
          note: (k) => note(notes, k),
        })
        if (res.kind === 'paint') return res.paint
        if (res.kind === 'unsupported') note(notes, res.what)
        // Missing paint server: SVG says use the fallback colour if there is one.
        const fb = url[3] ? parseColor(url[3]) : null
        return fb ? { type: 'solid', color: formatColor({ ...fb, a: fb.a * opacity }) } : null
      }

      const css = raw.toLowerCase() === 'currentcolor' ? cs.color : raw
      const c = parseColor(css)
      if (!c) {
        note(notes, 'unrecognised colour')
        return null
      }
      return { type: 'solid', color: formatColor({ ...c, a: c.a * opacity }) }
    }

    const noteUnsupported = (cs: CSSStyleDeclaration) => {
      if (cs.filter && cs.filter !== 'none') note(notes, 'filter')
      if ((cs.mask && cs.mask !== 'none') || (cs.maskImage && cs.maskImage !== 'none')) note(notes, 'mask')
      if (cs.clipPath && cs.clipPath !== 'none') note(notes, 'clip-path')
      if ([cs.markerStart, cs.markerMid, cs.markerEnd].some((m) => m && m !== 'none')) note(notes, 'marker')
    }

    const addPath = (el: SVGGraphicsElement, cs: CSSStyleDeclaration, opacity: number) => {
      const d = elementPath(el)
      if (!d) return
      const transform = relativeMatrix(el, inverseRoot)
      if (!transform) return
      const fill = paint('fill', el, cs)
      let stroke = paint('stroke', el, cs)
      const strokeWidth = num(cs.strokeWidth, 1)
      if (strokeWidth <= 0) stroke = null
      if (!fill && !stroke) return

      const i = paths.length
      const label = el.getAttribute('inkscape:label') ?? el.getAttribute('data-name') ?? el.getAttribute('id') ?? undefined
      const cap = cs.strokeLinecap
      const join = cs.strokeLinejoin
      paths.push({
        id: `p${i}`,
        name: label,
        d,
        transform,
        fill,
        stroke,
        strokeWidth: stroke ? strokeWidth : 0,
        lineCap: cap === 'round' || cap === 'square' ? cap : 'butt',
        lineJoin: join === 'round' || join === 'bevel' ? join : 'miter',
        miterLimit: num(cs.strokeMiterlimit, 4),
        dash: parseDashArray(cs.strokeDasharray),
        fillRule: cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
        // Group opacity is multiplied into each child — exact unless siblings overlap.
        opacity,
        visible: cs.visibility === 'visible',
      })
    }

    const walk = (parent: Element, inherited: number) => {
      for (const child of Array.from(parent.children)) {
        if (child.namespaceURI !== SVG_NS) continue
        const tag = child.localName
        const cs = win.getComputedStyle(child)
        // Also drops <defs>, <symbol>, <clipPath>, <mask>, <pattern>… (UA display:none).
        if (cs.display === 'none') continue
        const opacity = inherited * num(cs.opacity, 1)
        noteUnsupported(cs)

        if (CONTAINERS.has(tag)) walk(child, opacity)
        else if (SHAPES.has(tag)) addPath(child as SVGGraphicsElement, cs, opacity)
        else if (tag === 'text') note(notes, 'text')
        else if (tag === 'image') note(notes, 'embedded image')
      }
    }
    walk(root, 1)

    return { viewBox, paths }
  })
}

/** Sanitise + parse an SVG file. Throws SvgParseError with a user-readable message. */
export function importSvg(text: string, fileName: string): SvgImport {
  const { svg, notes } = sanitizeSvg(text)
  const { viewBox, paths } = parseSvg(svg, notes)
  if (paths.length === 0) {
    throw new SvgParseError('No drawable paths were found in this SVG (it may only contain text, images or filters).')
  }
  const warnings = formatNotes(notes)
  if (paths.length > 1000) warnings.push(`${paths.length} paths — editing and animation may be slow`)
  return {
    name: fileName.replace(/\.svg$/i, '') || 'SVG',
    viewBox,
    paths,
    sourceSvg: svg,
    warnings,
  }
}

/** The sanitised SVG as a flat raster-style image URL (today's behaviour, for the fallback). */
export function flatImageUrl(sourceSvg: string, viewBox: SvgImport['viewBox']): string {
  const doc = new DOMParser().parseFromString(sourceSvg, 'image/svg+xml')
  const root = doc.documentElement
  // An <img> needs an intrinsic size; derive it from the viewBox when absent.
  if (!root.getAttribute('width')) root.setAttribute('width', String(viewBox.width))
  if (!root.getAttribute('height')) root.setAttribute('height', String(viewBox.height))
  if (!root.getAttribute('viewBox')) root.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`
}
