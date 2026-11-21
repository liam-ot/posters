import type { ParamControl, ParamValue } from '../generators/config'
import { ColorInput, Field, Select, Slider, Toggle } from './controls'

/**
 * Renders a list of ParamControls (shared by generators and animation presets).
 * `params` should already include defaults.
 */
export function ParamControls({
  controls,
  params,
  onChange,
}: {
  controls: ParamControl[]
  params: Record<string, ParamValue>
  onChange: (key: string, value: ParamValue) => void
}) {
  return (
    <>
      {controls.map((c) => {
        const v = params[c.key]
        return (
          <Field key={c.key} label={c.label}>
            {c.type === 'slider' && (
              <>
                <Slider
                  value={v as number}
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  onChange={(val) => onChange(c.key, val)}
                />
              </>
            )}
            {c.type === 'color' && (
              <ColorInput
                value={v as string}
                onChange={(val) => onChange(c.key, val)}
              />
            )}
            {c.type === 'select' && (
              <Select
                value={v as string}
                options={c.options}
                onChange={(val) => onChange(c.key, val)}
              />
            )}
            {c.type === 'toggle' && (
              <Toggle
                value={v as boolean}
                onChange={(val) => onChange(c.key, val)}
              />
            )}
          </Field>
        )
      })}
    </>
  )
}
