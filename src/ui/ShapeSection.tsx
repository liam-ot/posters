import type { Layer, ShapeLayer } from '../types/poster'
import { SHAPES } from '../shapes/library'
import { ColorInput, Field, NumberInput, PanelSection, Segmented, Select, Toggle } from './controls'
import { ParamControls } from './ParamControls'

/** Shape-specific sliders plus fill / stroke styling. */
export function ShapeSection({
  layer,
  patch,
}: {
  layer: ShapeLayer
  patch: (p: Partial<Layer>) => void
}) {
  const def = SHAPES[layer.shape]
  const params = { ...def.defaults, ...layer.params }
  const hasFill = layer.fill !== null
  const hasStroke = layer.stroke !== null

  return (
    <PanelSection title={def.label}>
      <ParamControls
        controls={def.controls}
        params={params}
        onChange={(k, v) => patch({ params: { ...params, [k]: v } } as Partial<Layer>)}
      />

      <Field label="Fill">
        <Toggle
          value={hasFill}
          onChange={(on) => patch({ fill: on ? '#7c5cff' : null })}
        />
        {hasFill && (
          <ColorInput value={layer.fill!} onChange={(v) => patch({ fill: v })} />
        )}
      </Field>

      <Field label="Stroke">
        <Toggle
          value={hasStroke}
          onChange={(on) =>
            patch(
              on
                ? { stroke: '#ffffff', strokeWidth: layer.strokeWidth || 8 }
                : { stroke: null },
            )
          }
        />
        {hasStroke && (
          <ColorInput value={layer.stroke!} onChange={(v) => patch({ stroke: v })} />
        )}
      </Field>

      {hasStroke && (
        <>
          <div className="grid grid-cols-2 gap-x-2">
            <Field label="Width">
              <NumberInput
                value={layer.strokeWidth ?? 0}
                min={0}
                onChange={(v) => patch({ strokeWidth: v })}
              />
            </Field>
            <Field label="Style">
              <Select
                value={layer.strokeStyle ?? 'solid'}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'dashed', label: 'Dashed' },
                  { value: 'dotted', label: 'Dotted' },
                ]}
                onChange={(v) => patch({ strokeStyle: v })}
              />
            </Field>
          </div>
          <Field label="Caps">
            <Segmented
              value={layer.lineCap ?? (def.line ? 'round' : 'butt')}
              options={[
                { value: 'butt', label: 'Flat' },
                { value: 'round', label: 'Round' },
                { value: 'square', label: 'Square' },
              ]}
              onChange={(v) => patch({ lineCap: v })}
            />
          </Field>
        </>
      )}
    </PanelSection>
  )
}
