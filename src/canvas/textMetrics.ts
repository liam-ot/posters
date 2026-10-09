import Konva from 'konva'
import type { TextLayer } from '../types/poster'

/** The text style fields that affect measured size. */
export type TextStyle = Pick<
  TextLayer,
  | 'text'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'fontStyle'
  | 'lineHeight'
  | 'letterSpacing'
  | 'align'
>

/** Konva fontStyle string from weight + italic. */
export function konvaFontStyle(weight: number | string, italic: boolean) {
  return `${italic ? 'italic ' : ''}${weight}`
}

// A single detached Konva.Text reused for all measurements. Konva computes the
// wrapped line array on attr-set, independent of being attached to a stage, so
// this measures identically to what is rendered.
let node: Konva.Text | null = null
function measurer(): Konva.Text {
  if (!node) node = new Konva.Text({ padding: 0, wrap: 'word' })
  return node
}

function apply(t: Konva.Text, s: TextStyle, width: number | undefined) {
  t.setAttrs({
    text: s.text && s.text.length ? s.text : ' ',
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    fontStyle: konvaFontStyle(s.fontWeight, s.fontStyle === 'italic'),
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    align: s.align,
    wrap: 'word',
    padding: 0,
    width, // undefined => auto width (grows to the longest line)
  })
}

/** Natural (unwrapped) size — used to size a new text box to hug its text. */
export function measureTextNatural(s: TextStyle): { width: number; height: number } {
  const t = measurer()
  apply(t, s, undefined)
  return { width: Math.max(1, Math.ceil(t.width())), height: Math.max(1, Math.ceil(t.height())) }
}

/** Wrapped height at a fixed box width — used to size the border box. */
export function measureTextHeight(s: TextStyle, width: number): number {
  const t = measurer()
  apply(t, s, width)
  return Math.max(1, Math.ceil(t.height()))
}
