import type { ParamControl, ParamValue } from '../generators/config'
import type { PinPresetId } from './types'

/** What one pin loop contributes at a point in its cycle. */
export interface PinMove {
  /** Extra rotation around the parent pin, degrees. */
  angle: number
  /** Screen-aligned offset, character px. */
  dx: number
  dy: number
}

export interface PinPresetDef {
  id: PinPresetId
  label: string
  hint: string
  /** Only meaningful with a parent pin to swing around. */
  needsParent?: boolean
  defaults: Record<string, ParamValue>
  controls: ParamControl[]
  defaultPeriod: number // in beats
  move(cycle: number, params: Record<string, ParamValue>): PinMove
}

const TAU = Math.PI * 2
const num = (p: Record<string, ParamValue>, k: string) => Number(p[k])
const WAVE: ParamControl = {
  key: 'wave',
  label: 'Feel',
  type: 'select',
  options: [
    { value: 'sine', label: 'Smooth' },
    { value: 'beat', label: 'On the beat (hit + ease)' },
  ],
}
/** -1..1 back and forth (smooth), or a hit at cycle 0 easing out (beat). */
const wave = (c: number, kind: ParamValue) => (kind === 'beat' ? Math.pow(1 - c, 3) : Math.sin(TAU * c))
const along = (deg: number, d: number) => ({ dx: Math.cos((deg * Math.PI) / 180) * d, dy: Math.sin((deg * Math.PI) / 180) * d })

const defs: PinPresetDef[] = [
  {
    id: 'swing',
    label: 'Swing',
    hint: 'Rotates around its parent pin — an arm around the shoulder, a foot around the hip',
    needsParent: true,
    defaults: { angle: 20, wave: 'sine' },
    controls: [{ key: 'angle', label: 'Angle', type: 'slider', min: -90, max: 90, step: 1 }, WAVE],
    defaultPeriod: 2,
    move: (c, p) => ({ angle: num(p, 'angle') * wave(c, p.wave), dx: 0, dy: 0 }),
  },
  {
    id: 'bob',
    label: 'Bob',
    hint: 'Moves back and forth in a straight line',
    defaults: { distance: 12, direction: 90, wave: 'sine' },
    controls: [
      { key: 'distance', label: 'Distance', type: 'slider', min: 0, max: 120, step: 1 },
      { key: 'direction', label: 'Direction', type: 'slider', min: 0, max: 180, step: 5 },
      WAVE,
    ],
    defaultPeriod: 1,
    move: (c, p) => ({ angle: 0, ...along(num(p, 'direction'), num(p, 'distance') * wave(c, p.wave)) }),
  },
  {
    id: 'circle',
    label: 'Circle',
    hint: 'Traces a small circle or oval — stirring hands, rolling hips',
    defaults: { radius: 12, ratio: 1, clockwise: true },
    controls: [
      { key: 'radius', label: 'Radius', type: 'slider', min: 0, max: 120, step: 1 },
      { key: 'ratio', label: 'Oval', type: 'slider', min: 0.1, max: 2, step: 0.05 },
      { key: 'clockwise', label: 'Clockwise', type: 'toggle' },
    ],
    defaultPeriod: 2,
    move: (c, p) => {
      const r = num(p, 'radius')
      const s = p.clockwise ? 1 : -1
      // Starts where it rests (cycle 0 = no offset).
      return { angle: 0, dx: r * (Math.cos(TAU * c) - 1), dy: s * r * num(p, 'ratio') * Math.sin(TAU * c) }
    },
  },
  {
    id: 'bounce',
    label: 'Beat bounce',
    hint: 'Dips on every beat and springs back with a little overshoot',
    defaults: { distance: 14, direction: 90, spring: 1.5 },
    controls: [
      { key: 'distance', label: 'Distance', type: 'slider', min: 0, max: 120, step: 1 },
      { key: 'direction', label: 'Direction', type: 'slider', min: 0, max: 180, step: 5 },
      { key: 'spring', label: 'Spring', type: 'slider', min: 0, max: 3, step: 0.25 },
    ],
    defaultPeriod: 1,
    move: (c, p) => {
      const k = Math.pow(1 - c, 2) * Math.cos(Math.PI * num(p, 'spring') * c)
      return { angle: 0, ...along(num(p, 'direction'), num(p, 'distance') * k) }
    },
  },
]

export const PIN_PRESETS = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<PinPresetId, PinPresetDef>
export const PIN_PRESET_LIST = defs
