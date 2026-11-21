// Path-level presets (docs/adr/0011): they animate the individual paths of an
// svg or shape layer through `frame.paths` instead of the layer as a whole.
import type { ParamControl } from '../generators/config'
import type { AnimationPresetDef } from './presets'
import { cycleOf } from './timing'
import { orderRanks, staggerProgress, type PathOrder } from './stagger'
import type { Params } from './types'

const num = (p: Params, k: string) => Number(p[k])
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

const ORDER_CONTROL: ParamControl = {
  key: 'order',
  label: 'Order',
  type: 'select',
  options: [
    { value: 'document', label: 'Drawing order' },
    { value: 'reverse', label: 'Reverse' },
    { value: 'ltr', label: 'Left → right' },
    { value: 'ttb', label: 'Top → bottom' },
    { value: 'random', label: 'Random' },
  ],
}

export const pathPresetDefs: AnimationPresetDef[] = [
  {
    id: 'drawOn',
    label: 'Draw on',
    phases: ['in', 'out'],
    appliesTo: 'paths',
    defaults: { stagger: 0.4, order: 'document', fill: 'after', dashes: 'pop', outline: true, outlineWidth: 2 },
    controls: [
      { key: 'stagger', label: 'Stagger', type: 'slider', min: 0, max: 1, step: 0.01 },
      ORDER_CONTROL,
      {
        key: 'fill',
        label: 'Fill',
        type: 'select',
        options: [
          { value: 'after', label: 'Fades in after' },
          { value: 'with', label: 'Fades in with' },
          { value: 'none', label: 'Not animated' },
        ],
      },
      {
        key: 'dashes',
        label: 'Dashes',
        type: 'select',
        options: [
          { value: 'pop', label: 'Appear one by one' },
          { value: 'grow', label: 'Grow along' },
        ],
      },
      { key: 'outline', label: 'Outline fills', type: 'toggle' },
      { key: 'outlineWidth', label: 'Outline width', type: 'slider', min: 0.5, max: 20, step: 0.5 },
    ],
    defaultEasing: 'easeInOut',
    apply(frame, { u, ease, params, infos, seed }) {
      const paths = frame.paths
      if (!paths) return
      const ranks = orderRanks(params.order as PathOrder, infos, seed)
      const mode = String(params.fill)
      paths.forEach((pf, i) => {
        // Each path eases on its own window; with "fill after" the stroke takes the first 70% of it.
        const q = staggerProgress(u, ranks[i], paths.length, num(params, 'stagger'))
        const stroke = clamp01(ease(mode === 'after' ? clamp01(q / 0.7) : q))
        const fill = mode === 'with' ? clamp01(ease(q)) : mode === 'after' ? clamp01(ease(clamp01((q - 0.7) / 0.3))) : 1
        pf.draw = Math.min(pf.draw, stroke)
        pf.fillOpacity *= fill
        pf.dashMode = params.dashes === 'grow' ? 'grow' : 'pop'
        if (params.outline) {
          pf.outline = { width: num(params, 'outlineWidth') }
          // The outline thins away as the fill takes over (or as the stroke completes if fills aren't animated).
          pf.outlineFactor = Math.max(pf.outlineFactor, 1 - (mode === 'none' ? stroke : fill))
        }
      })
    },
  },
  {
    id: 'pathFade',
    label: 'Fade paths',
    phases: ['in', 'out'],
    appliesTo: 'paths',
    defaults: { stagger: 0.5, order: 'document', rise: 0 },
    controls: [
      { key: 'stagger', label: 'Stagger', type: 'slider', min: 0, max: 1, step: 0.01 },
      ORDER_CONTROL,
      { key: 'rise', label: 'Rise', type: 'slider', min: 0, max: 200, step: 1 },
    ],
    defaultEasing: 'easeOut',
    apply(frame, { u, ease, params, infos, seed }) {
      const paths = frame.paths
      if (!paths) return
      const ranks = orderRanks(params.order as PathOrder, infos, seed)
      paths.forEach((pf, i) => {
        const e = clamp01(ease(staggerProgress(u, ranks[i], paths.length, num(params, 'stagger'))))
        pf.opacity *= e
        pf.rise += num(params, 'rise') * (1 - e)
      })
    },
  },
  {
    id: 'wobble',
    label: 'Wobble',
    phases: ['loop'],
    appliesTo: 'paths',
    defaults: { amount: 5, size: 90, spacing: 30, roughness: 1.5, step: 0 },
    controls: [
      { key: 'amount', label: 'Amount', type: 'slider', min: 0, max: 60, step: 0.5 },
      { key: 'size', label: 'Feature size', type: 'slider', min: 10, max: 400, step: 5 },
      { key: 'spacing', label: 'Point spacing', type: 'slider', min: 4, max: 120, step: 2 },
      { key: 'roughness', label: 'Roughness', type: 'slider', min: 0.5, max: 6, step: 0.5 },
      { key: 'step', label: 'Steps/sec', type: 'slider', min: 0, max: 30, step: 1 },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 2.5,
    apply(frame, { t, period, params, seed }) {
      // `step` > 0 quantises time for a hand-drawn "boil"; 0 = smooth.
      const rate = num(params, 'step')
      const tq = rate > 0 ? Math.floor(t * rate + 1e-9) / rate : t
      const wobble = {
        amount: num(params, 'amount'),
        size: num(params, 'size'),
        spacing: num(params, 'spacing'),
        cycle: cycleOf(tq, period),
        radius: num(params, 'roughness'),
        seed,
      }
      // One shared field, so a logo bends as a whole rather than each path on its own.
      frame.paths?.forEach((pf) => (pf.wobble = wobble))
    },
  },
  {
    id: 'dashFlow',
    label: 'Dash flow',
    phases: ['loop'],
    appliesTo: 'paths',
    defaults: { dash: 3, gap: 2, cycles: 1, direction: 'forward' },
    controls: [
      { key: 'dash', label: 'Dash', type: 'slider', min: 0.5, max: 12, step: 0.5 },
      { key: 'gap', label: 'Gap', type: 'slider', min: 0.5, max: 12, step: 0.5 },
      { key: 'cycles', label: 'Speed', type: 'slider', min: 1, max: 8, step: 1 },
      {
        key: 'direction',
        label: 'Direction',
        type: 'select',
        options: [
          { value: 'forward', label: 'Forward' },
          { value: 'backward', label: 'Backward' },
        ],
      },
    ],
    defaultEasing: 'linear',
    defaultPeriod: 2,
    apply(frame, { cycle, params }) {
      // Whole pattern lengths per loop, so the loop is seamless. Dash/gap are
      // multiples of the stroke width; a path's own dash pattern wins if it has one.
      const sign = params.direction === 'backward' ? 1 : -1
      const flow = { phase: sign * num(params, 'cycles') * cycle, dash: num(params, 'dash'), gap: num(params, 'gap') }
      frame.paths?.forEach((pf) => (pf.flow = flow))
    },
  },
]
