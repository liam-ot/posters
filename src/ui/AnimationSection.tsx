import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type {
  AnimationPhase,
  Layer,
  LayerAnimation,
  TimeUnit,
} from '../types/poster'
import { useEditor } from '../store/editor'
import { EASING_OPTIONS } from '../animation/easing'
import { PRESETS, createAnimation, presetsFor } from '../animation/presets'
import { contextFor, loopsSeamlessly, periodSeconds } from '../animation/timing'
import { Field, NumberInput, PanelSection, Select, Slider, Toggle } from './controls'
import { ParamControls } from './ParamControls'

const GROUPS: { phase: AnimationPhase; title: string; hint: string }[] = [
  { phase: 'in', title: 'In', hint: 'Plays once when the layer enters' },
  { phase: 'loop', title: 'Loop', hint: 'Repeats for the whole timeline' },
  { phase: 'out', title: 'Out', hint: 'Plays once as the layer leaves' },
]

const UNIT_LABEL: Record<TimeUnit, string> = {
  sec: 'Seconds',
  beat: 'Beats',
  bar: 'Bars',
}

function AnimationRow({
  anim,
  open,
  onToggleOpen,
  onChange,
  onDelete,
}: {
  anim: LayerAnimation
  open: boolean
  onToggleOpen: () => void
  onChange: (patch: Partial<LayerAnimation>) => void
  onDelete: () => void
}) {
  const timeline = useEditor((s) => s.doc?.timeline)
  const def = PRESETS[anim.preset]
  if (!def || !timeline) return null
  const ctx = contextFor(timeline, false)
  const params = { ...def.defaults, ...anim.params }

  const unitOptions = (['sec', 'beat', 'bar'] as TimeUnit[])
    .filter((u) => u === 'sec' || ctx.bpm || u === anim.periodUnit)
    .map((u) => ({ value: u, label: UNIT_LABEL[u] }))

  const seamless =
    anim.phase !== 'loop' ||
    loopsSeamlessly(periodSeconds(anim, ctx), timeline.durationSec)

  return (
    <div className="mb-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)]/40">
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs text-[var(--color-text)]"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className={`truncate ${anim.enabled ? '' : 'opacity-50'}`}>
            {def.label}
          </span>
        </button>
        <Toggle value={anim.enabled} onChange={(v) => onChange({ enabled: v })} />
        <button
          title="Remove animation"
          onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {open && (
        <div className="border-t border-[var(--color-border)] px-2 py-1.5">
          {anim.phase === 'in' && (
            <div className="grid grid-cols-2 gap-x-2">
              <Field label="Delay">
                <NumberInput
                  value={anim.delay ?? 0}
                  min={0}
                  step={0.1}
                  suffix="s"
                  onChange={(v) => onChange({ delay: v })}
                />
              </Field>
              <Field label="Time">
                <NumberInput
                  value={anim.duration ?? 1}
                  min={0}
                  step={0.1}
                  suffix="s"
                  onChange={(v) => onChange({ duration: v })}
                />
              </Field>
            </div>
          )}
          {anim.phase === 'out' && (
            <div className="grid grid-cols-2 gap-x-2">
              <Field label="Ends before">
                <NumberInput
                  value={anim.endOffset ?? 0}
                  min={0}
                  step={0.1}
                  suffix="s"
                  onChange={(v) => onChange({ endOffset: v })}
                />
              </Field>
              <Field label="Time">
                <NumberInput
                  value={anim.duration ?? 1}
                  min={0}
                  step={0.1}
                  suffix="s"
                  onChange={(v) => onChange({ duration: v })}
                />
              </Field>
            </div>
          )}
          {anim.phase === 'loop' && (
            <>
              <Field label="Period">
                <NumberInput
                  value={anim.period ?? 1}
                  min={0.05}
                  step={0.25}
                  onChange={(v) => onChange({ period: v })}
                />
                <div className="w-24 shrink-0">
                  <Select
                    value={anim.periodUnit ?? 'sec'}
                    options={unitOptions}
                    onChange={(v) => onChange({ periodUnit: v })}
                  />
                </div>
              </Field>
              <Field label="Offset">
                <Slider
                  value={anim.phaseOffset ?? 0}
                  min={0}
                  max={0.95}
                  step={0.05}
                  onChange={(v) => onChange({ phaseOffset: v || undefined })}
                />
                <button
                  title="Half a period later — e.g. the off-beat, for left/right alternation"
                  onClick={() => onChange({ phaseOffset: anim.phaseOffset === 0.5 ? undefined : 0.5 })}
                  className={`h-6 shrink-0 rounded-md px-1.5 text-[11px] ${
                    anim.phaseOffset === 0.5
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'
                  }`}
                >
                  ½
                </button>
              </Field>
              {!ctx.bpm && (
                <p className="pb-1 text-[11px] text-[var(--color-muted)]">
                  Set a BPM in the timeline bar to use beats and bars.
                </p>
              )}
              {!seamless && (
                <p className="pb-1 text-[11px] text-amber-400">
                  This period doesn’t divide the {timeline.durationSec}s timeline, so the
                  loop will jump when the video repeats.
                </p>
              )}
            </>
          )}

          {anim.phase !== 'loop' && (
            <Field label="Easing">
              <Select
                value={anim.easing}
                options={EASING_OPTIONS}
                onChange={(v) => onChange({ easing: v })}
              />
            </Field>
          )}

          <ParamControls
            controls={def.controls}
            params={params}
            onChange={(k, v) => onChange({ params: { ...anim.params, [k]: v } })}
          />
        </div>
      )}
    </div>
  )
}

function AddMenu({
  phase,
  layerType,
  disabled,
  onAdd,
}: {
  phase: AnimationPhase
  layerType: string
  disabled: boolean
  onAdd: (preset: LayerAnimation['preset']) => void
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          title={disabled ? 'Only one per layer — remove it to add another' : 'Add animation'}
          disabled={disabled}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Plus size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-1 shadow-2xl"
        >
          {presetsFor(phase, layerType).map((d) => (
            <DropdownMenu.Item
              key={d.id}
              onSelect={() => onAdd(d.id)}
              className="cursor-pointer rounded-md px-2 py-1.5 text-sm text-[var(--color-text)] outline-none data-[highlighted]:bg-[var(--color-panel-2)]"
            >
              {d.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** In / Loop / Out animation presets for one layer (docs/adr/0001, 0005). */
export function AnimationSection({
  layer,
  patch,
}: {
  layer: Layer
  patch: (p: Partial<Layer>) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const anims = layer.animations ?? []
  const setAnims = (next: LayerAnimation[]) => patch({ animations: next })

  return (
    <PanelSection title="Animation">
      {GROUPS.map(({ phase, title, hint }) => {
        const inGroup = anims.filter((a) => a.phase === phase)
        // in/out are limited to one each; loops can stack.
        const full = phase !== 'loop' && inGroup.length >= 1
        return (
          <div key={phase} className="mb-2">
            <div className="mb-1 flex items-center justify-between">
              <span title={hint} className="text-xs font-medium text-[var(--color-text)]">
                {title}
              </span>
              <AddMenu
                phase={phase}
                layerType={layer.type}
                disabled={full}
                onAdd={(preset) => {
                  const a = createAnimation(preset, phase, nanoid(8))
                  setAnims([...anims, a])
                  setOpenId(a.id)
                }}
              />
            </div>
            {inGroup.length === 0 && (
              <p className="text-[11px] text-[var(--color-muted)]">{hint}</p>
            )}
            {inGroup.map((a) => (
              <AnimationRow
                key={a.id}
                anim={a}
                open={openId === a.id}
                onToggleOpen={() => setOpenId(openId === a.id ? null : a.id)}
                onChange={(p) =>
                  setAnims(anims.map((x) => (x.id === a.id ? { ...x, ...p } : x)))
                }
                onDelete={() => setAnims(anims.filter((x) => x.id !== a.id))}
              />
            ))}
          </div>
        )
      })}
    </PanelSection>
  )
}
