import type {
  AnimationPhase,
  AnimationPresetId,
  EasingName,
  LayerAnimation,
} from '../types/poster'
import type { ParamControl, ParamValue } from '../generators/config'
import { loopNoise } from './noise'
import { cycleOf } from './timing'
import { pathPresetDefs } from './pathPresets'
import type { LayerFrame, Params, PresetInput } from './types'

export interface AnimationPresetDef {
  id: AnimationPresetId
  label: string
  phases: AnimationPhase[]
  /** 'paths' presets (draw-on, wobble…) only apply to svg/shape layers — Phase 4. */
  appliesTo: 'all' | 'paths'
  defaults: Record<string, ParamValue>
  controls: ParamControl[]
  defaultEasing: EasingName
  /** Seconds; used when the preset is added as a loop. */
  defaultPeriod?: number
  apply(frame: LayerFrame, input: PresetInput): void
}

const num = (p: Params, k: string) => Number(p[k])
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const TAU = Math.PI * 2

const FADE_CONTROL: ParamControl = { key: 'fade', label: 'Fade', type: 'toggle' }

/** in/out helper: also fade with presence when the preset asks for it. */
function fadeWith(frame: LayerFrame, p: number, params: Params) {
  if (params.fade) frame.opacity *= clamp01(p)
}

const defs: AnimationPresetDef[] = [
  {
    id: 'fade',
    label: 'Fade',
    phases: ['in', 'out'],
    appliesTo: 'all',
    defaults: {},
    controls: [],
    defaultEasing: 'easeOut',
    apply(frame, { p }) {
      frame.opacity *= clamp01(p)
    },
  },
  {
    id: 'slide',
    label: 'Slide',
    phases: ['in', 'out'],
    appliesTo: 'all',
    defaults: { from: 'bottom', distance: 120, fade: true },
    controls: [
      {
        key: 'from',
        label: 'From',
        type: 'select',
        options: [
          { value: 'bottom', label: 'Bottom' },
          { value: 'top', label: 'Top' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
      },
      { key: 'distance', label: 'Distance', type: 'slider', min: 0, max: 800, step: 5 },
      FADE_CONTROL,
    ],
    defaultEasing: 'easeOut',
    apply(frame, { p, params }) {
      const off = num(params, 'distance') * (1 - p)
      switch (params.from) {
        case 'top':
          frame.dy -= off
          break
        case 'left':
          frame.dx -= off
          break
        case 'right':
          frame.dx += off
          break
        default:
          frame.dy += off
      }
      fadeWith(frame, p, params)
    },
  },
  {
    id: 'scale',
    label: 'Scale',
    phases: ['in', 'out'],
    appliesTo: 'all',
    defaults: { from: 0, fade: false },
    controls: [
      { key: 'from', label: 'From', type: 'slider', min: 0, max: 2, step: 0.05 },
      FADE_CONTROL,
    ],
    defaultEasing: 'backOut',
    apply(frame, { p, params }) {
      const from = num(params, 'from')
      const s = Math.max(0, from + (1 - from) * p) // never negative (no flipping)
      frame.scaleX *= s
      frame.scaleY *= s
      fadeWith(frame, p, params)
    },
  },
  {
    id: 'rotate',
    label: 'Rotate',
    phases: ['in', 'out'],
    appliesTo: 'all',
    defaults: { degrees: 90, fade: true },
    controls: [
      { key: 'degrees', label: 'Degrees', type: 'slider', min: -360, max: 360, step: 5 },
      FADE_CONTROL,
    ],
    defaultEasing: 'easeOut',
    apply(frame, { p, params }) {
      frame.rotation += num(params, 'degrees') * (1 - p)
      fadeWith(frame, p, params)
    },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    phases: ['loop'],
    appliesTo: 'all',
    defaults: { amount: 0.1, shape: 'sine' },
    controls: [
      { key: 'amount', label: 'Amount', type: 'slider', min: 0, max: 0.6, step: 0.01 },
      {
        key: 'shape',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'sine', label: 'Smooth' },
          { value: 'beat', label: 'Beat (hit + decay)' },
        ],
      },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 1,
    apply(frame, { cycle, params }) {
      // Both shapes are 0 at rest-neutral points; 'beat' peaks at cycle 0 (the hit).
      const k =
        params.shape === 'beat'
          ? Math.pow(1 - cycle, 3)
          : (1 - Math.cos(TAU * cycle)) / 2
      const s = 1 + num(params, 'amount') * k
      frame.scaleX *= s
      frame.scaleY *= s
    },
  },
  {
    id: 'float',
    label: 'Float',
    phases: ['loop'],
    appliesTo: 'all',
    defaults: { distance: 24, axis: 'y' },
    controls: [
      { key: 'distance', label: 'Distance', type: 'slider', min: 0, max: 200, step: 1 },
      {
        key: 'axis',
        label: 'Axis',
        type: 'select',
        options: [
          { value: 'y', label: 'Vertical' },
          { value: 'x', label: 'Horizontal' },
        ],
      },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 2.5,
    apply(frame, { cycle, params }) {
      const v = num(params, 'distance') * Math.sin(TAU * cycle)
      if (params.axis === 'x') frame.dx += v
      else frame.dy += v
    },
  },
  {
    id: 'spin',
    label: 'Spin',
    phases: ['loop'],
    appliesTo: 'all',
    defaults: { revolutions: 1, direction: 'cw' },
    controls: [
      { key: 'revolutions', label: 'Turns', type: 'slider', min: 1, max: 8, step: 1 },
      {
        key: 'direction',
        label: 'Direction',
        type: 'select',
        options: [
          { value: 'cw', label: 'Clockwise' },
          { value: 'ccw', label: 'Counter-clockwise' },
        ],
      },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 5,
    apply(frame, { cycle, params }) {
      const sign = params.direction === 'ccw' ? -1 : 1
      frame.rotation += sign * 360 * num(params, 'revolutions') * cycle
    },
  },
  {
    id: 'sway',
    label: 'Sway',
    phases: ['loop'],
    appliesTo: 'all',
    defaults: { degrees: 8 },
    controls: [
      { key: 'degrees', label: 'Degrees', type: 'slider', min: 0, max: 45, step: 0.5 },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 2.5,
    apply(frame, { cycle, params }) {
      frame.rotation += num(params, 'degrees') * Math.sin(TAU * cycle)
    },
  },
  {
    id: 'jitter',
    label: 'Jitter',
    phases: ['loop'],
    appliesTo: 'all',
    defaults: { position: 6, rotation: 2, roughness: 2, step: 0 },
    controls: [
      { key: 'position', label: 'Position', type: 'slider', min: 0, max: 60, step: 0.5 },
      { key: 'rotation', label: 'Rotation', type: 'slider', min: 0, max: 30, step: 0.5 },
      { key: 'roughness', label: 'Roughness', type: 'slider', min: 0.5, max: 8, step: 0.5 },
      { key: 'step', label: 'Steps/sec', type: 'slider', min: 0, max: 30, step: 1 },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 1,
    apply(frame, { t, period, params, seed }) {
      // `step` > 0 quantises time for a hand-drawn "boil"; 0 = smooth.
      const rate = num(params, 'step')
      const tq = rate > 0 ? Math.floor(t * rate + 1e-9) / rate : t
      const c = cycleOf(tq, period)
      const r = num(params, 'roughness')
      frame.dx += num(params, 'position') * loopNoise(seed, 0, c, r)
      frame.dy += num(params, 'position') * loopNoise(seed, 1, c, r)
      frame.rotation += num(params, 'rotation') * loopNoise(seed, 2, c, r)
    },
  },
  {
    id: 'blink',
    label: 'Blink',
    phases: ['loop'],
    appliesTo: 'all',
    defaults: { minOpacity: 0, duty: 0.5 },
    controls: [
      { key: 'minOpacity', label: 'Min opacity', type: 'slider', min: 0, max: 1, step: 0.05 },
      { key: 'duty', label: 'On time', type: 'slider', min: 0.05, max: 0.95, step: 0.05 },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 1,
    apply(frame, { cycle, params }) {
      if (cycle >= num(params, 'duty')) frame.opacity *= num(params, 'minOpacity')
    },
  },
]

defs.push(...pathPresetDefs)

export const PRESETS = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<
  AnimationPresetId,
  AnimationPresetDef
>

export const PRESET_LIST = defs

/** Presets that can be added to a layer in a given phase. Path presets only apply to vector layers. */
export function presetsFor(phase: AnimationPhase, layerType?: string): AnimationPresetDef[] {
  const pathLayer = layerType === 'svg' || layerType === 'shape' || layerType === 'puppet'
  return defs.filter(
    (d) => d.phases.includes(phase) && (d.appliesTo === 'all' || pathLayer),
  )
}

/** Does this layer have an enabled path-level animation (one that needs measured path info)? */
export function hasPathPresets(layer: { animations?: LayerAnimation[] }): boolean {
  return !!layer.animations?.some((a) => a.enabled && PRESETS[a.preset]?.appliesTo === 'paths')
}

/** A new animation with the preset's defaults. Params stay sparse (merged with defaults at eval). */
export function createAnimation(
  preset: AnimationPresetId,
  phase: AnimationPhase,
  id: string,
): LayerAnimation {
  const def = PRESETS[preset]
  const base: LayerAnimation = {
    id,
    preset,
    phase,
    enabled: true,
    easing: def.defaultEasing,
    params: {},
  }
  if (phase === 'loop') {
    return { ...base, period: def.defaultPeriod ?? 1, periodUnit: 'sec' }
  }
  return phase === 'in'
    ? { ...base, delay: 0, duration: 1 }
    : { ...base, endOffset: 0, duration: 1 }
}
