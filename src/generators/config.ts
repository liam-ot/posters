import type { GeneratorKind } from '../types/poster'

export type ParamValue = number | string | boolean

export type ParamControl =
  | { key: string; label: string; type: 'slider'; min: number; max: number; step: number }
  | { key: string; label: string; type: 'color' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'toggle' }

export interface GeneratorConfig {
  defaults: Record<string, ParamValue>
  controls: ParamControl[]
}

export const GENERATORS: Record<GeneratorKind, GeneratorConfig> = {
  noise: {
    defaults: {
      scale: 6,
      speed: 0.4,
      contrast: 1.4,
      mono: true,
      colorA: '#000000',
      colorB: '#7c5cff',
    },
    controls: [
      { key: 'scale', label: 'Scale', type: 'slider', min: 1, max: 60, step: 1 },
      { key: 'speed', label: 'Speed', type: 'slider', min: 0, max: 3, step: 0.05 },
      { key: 'contrast', label: 'Contrast', type: 'slider', min: 0.2, max: 4, step: 0.1 },
      { key: 'mono', label: 'Monochrome', type: 'toggle' },
      { key: 'colorA', label: 'Color A', type: 'color' },
      { key: 'colorB', label: 'Color B', type: 'color' },
    ],
  },
  static: {
    defaults: {
      intensity: 1,
      density: 0.5,
      mono: true,
      tint: '#ffffff',
      scanlines: false,
    },
    controls: [
      { key: 'intensity', label: 'Intensity', type: 'slider', min: 0, max: 1, step: 0.01 },
      { key: 'density', label: 'Density', type: 'slider', min: 0, max: 1, step: 0.01 },
      { key: 'mono', label: 'Monochrome', type: 'toggle' },
      { key: 'tint', label: 'Tint', type: 'color' },
      { key: 'scanlines', label: 'Scanlines', type: 'toggle' },
    ],
  },
  pattern: {
    defaults: {
      type: 'dots',
      scale: 12,
      angle: 0,
      speed: 0.5,
      colorA: '#0e0e12',
      colorB: '#00d4ff',
    },
    controls: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'stripes', label: 'Stripes' },
          { value: 'dots', label: 'Dots' },
          { value: 'grid', label: 'Grid' },
          { value: 'checker', label: 'Checker' },
          { value: 'waves', label: 'Waves' },
        ],
      },
      { key: 'scale', label: 'Count', type: 'slider', min: 2, max: 60, step: 1 },
      { key: 'angle', label: 'Angle', type: 'slider', min: 0, max: 360, step: 1 },
      { key: 'speed', label: 'Speed', type: 'slider', min: 0, max: 4, step: 0.05 },
      { key: 'colorA', label: 'Background', type: 'color' },
      { key: 'colorB', label: 'Foreground', type: 'color' },
    ],
  },
}

export function defaultParams(kind: GeneratorKind): Record<string, ParamValue> {
  return { ...GENERATORS[kind].defaults }
}
