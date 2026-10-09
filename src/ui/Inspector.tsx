import { Shuffle } from 'lucide-react'
import type { BlendMode, GeneratorLayer, Layer } from '../types/poster'
import { useEditor } from '../store/editor'
import { GENERATORS } from '../generators/config'
import { ARTBOARD_PRESETS } from '../lib/presets'
import {
  ColorInput,
  Field,
  NumberInput,
  PanelSection,
  Segmented,
  Select,
  Slider,
  TextInput,
  Toggle,
} from './controls'
import { FontPicker } from './FontPicker'

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color dodge' },
  { value: 'color-burn', label: 'Color burn' },
  { value: 'hard-light', label: 'Hard light' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
]

function ArtboardInspector() {
  const doc = useEditor((s) => s.doc)
  const updateArtboard = useEditor((s) => s.updateArtboard)
  const renameDoc = useEditor((s) => s.renameDoc)
  if (!doc) return null
  return (
    <>
      <PanelSection title="Document">
        <Field label="Name">
          <TextInput value={doc.name} onChange={(v) => renameDoc(v)} />
        </Field>
      </PanelSection>
      <PanelSection title="Artboard">
        <Field label="Preset">
          <Select
            value={
              ARTBOARD_PRESETS.find(
                (p) =>
                  p.width === doc.artboard.width &&
                  p.height === doc.artboard.height,
              )?.label ?? 'custom'
            }
            options={[
              { value: 'custom', label: 'Custom' },
              ...ARTBOARD_PRESETS.map((p) => ({ value: p.label, label: p.label })),
            ]}
            onChange={(label) => {
              const preset = ARTBOARD_PRESETS.find((p) => p.label === label)
              if (preset)
                updateArtboard({ width: preset.width, height: preset.height })
            }}
          />
        </Field>
        <Field label="Width">
          <NumberInput
            value={doc.artboard.width}
            min={1}
            onChange={(v) => updateArtboard({ width: Math.round(v) })}
            suffix="px"
          />
        </Field>
        <Field label="Height">
          <NumberInput
            value={doc.artboard.height}
            min={1}
            onChange={(v) => updateArtboard({ height: Math.round(v) })}
            suffix="px"
          />
        </Field>
        <Field label="Background">
          <ColorInput
            value={doc.artboard.background}
            onChange={(v) => updateArtboard({ background: v })}
          />
        </Field>
      </PanelSection>
    </>
  )
}

function TransformSection({
  layer,
  patch,
}: {
  layer: Layer
  patch: (p: Partial<Layer>) => void
}) {
  return (
    <PanelSection title="Transform">
      <div className="grid grid-cols-2 gap-x-2">
        <Field label="X">
          <NumberInput value={layer.x} onChange={(v) => patch({ x: v })} />
        </Field>
        <Field label="Y">
          <NumberInput value={layer.y} onChange={(v) => patch({ y: v })} />
        </Field>
        <Field label="W">
          <NumberInput
            value={layer.width}
            min={1}
            onChange={(v) => patch({ width: v })}
          />
        </Field>
        <Field label="H">
          <NumberInput
            value={layer.height}
            min={1}
            onChange={(v) => patch({ height: v })}
          />
        </Field>
      </div>
      <Field label="Rotation">
        <NumberInput
          value={layer.rotation}
          onChange={(v) => patch({ rotation: v })}
          suffix="°"
        />
      </Field>
    </PanelSection>
  )
}

function AppearanceSection({
  layer,
  patch,
}: {
  layer: Pick<Layer, 'opacity' | 'blendMode'>
  patch: (p: Partial<Layer>) => void
}) {
  return (
    <PanelSection title="Appearance">
      <Field label="Opacity">
        <Slider
          value={layer.opacity}
          onChange={(v) => patch({ opacity: v })}
        />
        <span className="w-9 shrink-0 text-right text-xs text-[var(--color-muted)]">
          {Math.round(layer.opacity * 100)}%
        </span>
      </Field>
      <Field label="Blend">
        <Select
          value={layer.blendMode ?? 'source-over'}
          options={BLEND_MODES}
          onChange={(v) => patch({ blendMode: v })}
        />
      </Field>
    </PanelSection>
  )
}

function GeneratorSection({
  layer,
  patch,
}: {
  layer: GeneratorLayer
  patch: (p: Partial<Layer>) => void
}) {
  const cfg = GENERATORS[layer.generator]
  const params = { ...cfg.defaults, ...layer.params }
  const setParam = (key: string, value: number | string | boolean) =>
    patch({ params: { ...params, [key]: value } } as Partial<Layer>)

  return (
    <PanelSection title={`${layer.generator} generator`}>
      <Field label="Animated">
        <Toggle
          value={layer.animated}
          onChange={(v) => patch({ animated: v })}
        />
      </Field>
      <Field label="Seed">
        <NumberInput
          value={layer.seed}
          onChange={(v) => patch({ seed: Math.round(v) })}
        />
        <button
          title="Randomize seed"
          onClick={() =>
            patch({ seed: Math.floor(Math.random() * 100000) })
          }
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <Shuffle size={13} />
        </button>
      </Field>
      {cfg.controls.map((c) => {
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
                  onChange={(val) => setParam(c.key, val)}
                />
                <span className="w-9 shrink-0 text-right text-xs text-[var(--color-muted)]">
                  {typeof v === 'number' && c.step < 1
                    ? (v as number).toFixed(2)
                    : v}
                </span>
              </>
            )}
            {c.type === 'color' && (
              <ColorInput
                value={v as string}
                onChange={(val) => setParam(c.key, val)}
              />
            )}
            {c.type === 'select' && (
              <Select
                value={v as string}
                options={c.options}
                onChange={(val) => setParam(c.key, val)}
              />
            )}
            {c.type === 'toggle' && (
              <Toggle
                value={v as boolean}
                onChange={(val) => setParam(c.key, val)}
              />
            )}
          </Field>
        )
      })}
    </PanelSection>
  )
}

function BorderControls({
  layer,
  patch,
}: {
  layer: { stroke?: string; strokeWidth?: number; strokeStyle?: string }
  patch: (p: Partial<Layer>) => void
}) {
  return (
    <>
      <Field label="Border">
        <ColorInput
          value={layer.stroke ?? '#000000'}
          onChange={(v) => patch({ stroke: v } as Partial<Layer>)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-x-2">
        <Field label="Width">
          <NumberInput
            value={layer.strokeWidth ?? 0}
            min={0}
            onChange={(v) => patch({ strokeWidth: v } as Partial<Layer>)}
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
            onChange={(v) => patch({ strokeStyle: v } as Partial<Layer>)}
          />
        </Field>
      </div>
    </>
  )
}

function TypeSection({
  layer,
  patch,
}: {
  layer: Layer
  patch: (p: Partial<Layer>) => void
}) {
  switch (layer.type) {
    case 'rect':
      return (
        <PanelSection title="Rectangle">
          <Field label="Fill">
            <ColorInput value={layer.fill} onChange={(v) => patch({ fill: v })} />
          </Field>
          <Field label="Radius">
            <NumberInput
              value={layer.cornerRadius ?? 0}
              min={0}
              onChange={(v) => patch({ cornerRadius: v })}
            />
          </Field>
          <BorderControls layer={layer} patch={patch} />
        </PanelSection>
      )
    case 'ellipse':
      return (
        <PanelSection title="Ellipse">
          <Field label="Fill">
            <ColorInput value={layer.fill} onChange={(v) => patch({ fill: v })} />
          </Field>
          <BorderControls layer={layer} patch={patch} />
        </PanelSection>
      )
    case 'text':
      return (
        <PanelSection title="Text">
          <textarea
            className="mb-2 h-16 w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] p-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            value={layer.text}
            onChange={(e) => patch({ text: e.target.value })}
          />
          <Field label="Font">
            <FontPicker
              value={layer.fontFamily}
              onChange={(v) => patch({ fontFamily: v })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-x-2">
            <Field label="Size">
              <NumberInput
                value={layer.fontSize}
                min={1}
                onChange={(v) => patch({ fontSize: v })}
              />
            </Field>
            <Field label="Weight">
              <Select
                value={String(layer.fontWeight)}
                options={[
                  { value: '300', label: 'Light' },
                  { value: '400', label: 'Regular' },
                  { value: '500', label: 'Medium' },
                  { value: '600', label: 'Semibold' },
                  { value: '700', label: 'Bold' },
                  { value: '800', label: 'Extrabold' },
                  { value: '900', label: 'Black' },
                ]}
                onChange={(v) => patch({ fontWeight: Number(v) })}
              />
            </Field>
          </div>
          <Field label="Align">
            <Segmented
              value={layer.align}
              options={[
                { value: 'left', label: 'L' },
                { value: 'center', label: 'C' },
                { value: 'right', label: 'R' },
              ]}
              onChange={(v) => patch({ align: v })}
            />
          </Field>
          <Field label="Style">
            <Segmented
              value={layer.fontStyle}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'italic', label: 'Italic' },
              ]}
              onChange={(v) => patch({ fontStyle: v })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-x-2">
            <Field label="Line">
              <NumberInput
                value={layer.lineHeight}
                step={0.05}
                min={0.5}
                onChange={(v) => patch({ lineHeight: v })}
              />
            </Field>
            <Field label="Spacing">
              <NumberInput
                value={layer.letterSpacing}
                onChange={(v) => patch({ letterSpacing: v })}
              />
            </Field>
          </div>
          <Field label="Color">
            <ColorInput value={layer.fill} onChange={(v) => patch({ fill: v })} />
          </Field>
          <BorderControls layer={layer} patch={patch} />
        </PanelSection>
      )
    case 'image':
      return (
        <PanelSection title="Image">
          <BorderControls layer={layer} patch={patch} />
        </PanelSection>
      )
    case 'generator':
      return <GeneratorSection layer={layer} patch={patch} />
    default:
      return null
  }
}

export function Inspector() {
  const selectedIds = useEditor((s) => s.selectedIds)
  const doc = useEditor((s) => s.doc)
  const updateLayer = useEditor((s) => s.updateLayer)
  const updateSelected = useEditor((s) => s.updateSelected)

  const selected =
    doc?.layers.filter((l) => selectedIds.includes(l.id)) ?? []

  if (selected.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <ArtboardInspector />
      </div>
    )
  }

  if (selected.length > 1) {
    return (
      <div className="h-full overflow-y-auto">
        <PanelSection title={`${selected.length} layers selected`}>
          <p className="text-xs text-[var(--color-muted)]">
            Editing shared appearance.
          </p>
        </PanelSection>
        <AppearanceSection
          layer={{
            opacity: selected[0].opacity,
            blendMode: selected[0].blendMode,
          }}
          patch={updateSelected}
        />
      </div>
    )
  }

  const layer = selected[0]
  const patch = (p: Partial<Layer>) => updateLayer(layer.id, p)

  return (
    <div className="h-full overflow-y-auto">
      <TransformSection layer={layer} patch={patch} />
      <TypeSection layer={layer} patch={patch} />
      <AppearanceSection layer={layer} patch={patch} />
    </div>
  )
}
