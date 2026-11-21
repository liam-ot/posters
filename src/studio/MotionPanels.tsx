import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { TimeUnit } from '../types/poster'
import type { PinAnimation, PinPresetId, PoseLoop, PuppetAsset, PuppetPin } from '../puppet/types'
import { DEFAULT_POSE_LOOP } from '../puppet/normalize'
import { PIN_PRESETS, PIN_PRESET_LIST } from '../puppet/pinPresets'
import { contextFor, loopsSeamlessly, periodSeconds } from '../animation/timing'
import { Field, NumberInput, PanelSection, Select, Slider, Toggle } from '../ui/controls'
import { ParamControls } from '../ui/ParamControls'
import { useStudio } from './store'
import { previewTimeline } from './playback'

const UNITS: { value: TimeUnit; label: string }[] = [
  { value: 'beat', label: 'Beats' },
  { value: 'bar', label: 'Bars' },
  { value: 'sec', label: 'Seconds' },
]

/** Period + unit + phase offset — shared by the pose loop and pin loops. */
function Timing({
  period,
  periodUnit,
  phaseOffset,
  onChange,
  asset,
}: {
  period: number
  periodUnit: TimeUnit
  phaseOffset?: number
  onChange: (p: { period?: number; periodUnit?: TimeUnit; phaseOffset?: number }) => void
  asset: PuppetAsset
}) {
  const tl = previewTimeline(asset)
  const seamless = loopsSeamlessly(periodSeconds({ period, periodUnit } as never, contextFor(tl, false)), tl.durationSec)
  return (
    <>
      <Field label="Every">
        <NumberInput value={period} min={0.25} step={0.25} onChange={(v) => onChange({ period: v })} />
        <div className="w-24 shrink-0">
          <Select value={periodUnit} options={UNITS} onChange={(v) => onChange({ periodUnit: v })} />
        </div>
      </Field>
      <Field label="Offset">
        <Slider value={phaseOffset ?? 0} min={0} max={0.95} step={0.05} onChange={(v) => onChange({ phaseOffset: v || undefined })} />
        <button
          title="Half a cycle later — left and right alternate"
          onClick={() => onChange({ phaseOffset: phaseOffset === 0.5 ? undefined : 0.5 })}
          className={`h-6 shrink-0 rounded-md px-1.5 text-[11px] ${
            phaseOffset === 0.5
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'
          }`}
        >
          ½
        </button>
      </Field>
      {!seamless && (
        <p className="pb-1 text-[11px] text-amber-400">
          This doesn’t divide the preview length, so the loop jumps when it repeats. Beats and bars stay in step.
        </p>
      )}
    </>
  )
}

/** The selected motion's settings: name and its pose loop. */
export function MotionSection({ asset }: { asset: PuppetAsset }) {
  const motionId = useStudio((s) => s.motionId)
  const edit = useStudio((s) => s.edit)
  const motion = asset.motions.find((m) => m.id === motionId)
  if (!motion) return null
  const loop = motion.poseLoop ?? DEFAULT_POSE_LOOP
  const posed = Object.keys(motion.poses ?? {}).length > 0
  const setLoop = (p: Partial<PoseLoop>) =>
    edit((d) => {
      const m = d.motions.find((x) => x.id === motion.id)
      if (m) m.poseLoop = { ...(m.poseLoop ?? DEFAULT_POSE_LOOP), ...p }
    })

  return (
    <PanelSection title={`Motion · ${motion.name}`}>
      <Field label="Pose loop">
        <Toggle value={loop.enabled} onChange={(v) => setLoop({ enabled: v })} />
      </Field>
      {!posed && (
        <p className="pb-1 text-[11px] text-[var(--color-muted)]">
          Drag pins while this motion is selected to give it a pose; the loop moves between that pose and the base pose.
        </p>
      )}
      {loop.enabled && (
        <>
          <Field label="Feel">
            <Select
              value={loop.shape}
              options={[
                { value: 'smooth', label: 'Smooth rock' },
                { value: 'pop', label: 'Pop between poses' },
                { value: 'hit', label: 'Hit on the beat' },
              ]}
              onChange={(v) => setLoop({ shape: v })}
            />
          </Field>
          <Timing
            asset={asset}
            period={loop.period}
            periodUnit={loop.periodUnit}
            phaseOffset={loop.phaseOffset}
            onChange={(p) => setLoop(p)}
          />
        </>
      )}
      <p className="mt-1 text-[11px] text-[var(--color-muted)]">
        Beats and bars follow each poster’s BPM. Press play below to preview.
      </p>
    </PanelSection>
  )
}

/** Pins that can be this pin's parent: other pins, but not its own descendants. */
function parentOptions(pins: PuppetPin[], pin: PuppetPin) {
  const descends = (p: PuppetPin): boolean => {
    let cur: string | undefined = p.parent
    for (let guard = 0; cur && guard <= pins.length; guard++) {
      if (cur === pin.id) return true
      cur = pins.find((x) => x.id === cur)?.parent
    }
    return false
  }
  return pins.filter((p) => p.kind === 'pin' && p.id !== pin.id && !descends(p))
}

/** Parent picker (always) and this pin's loops in the selected motion. */
export function PinMotionControls({ asset, pin }: { asset: PuppetAsset; pin: PuppetPin }) {
  const motionId = useStudio((s) => s.motionId)
  const edit = useStudio((s) => s.edit)
  const motion = asset.motions.find((m) => m.id === motionId)
  const loops = motion?.animations[pin.id] ?? []
  const setLoops = (next: PinAnimation[]) =>
    edit((d) => {
      const m = d.motions.find((x) => x.id === motionId)
      if (m) m.animations[pin.id] = next
    })
  const setOne = (id: string, p: Partial<PinAnimation>) => setLoops(loops.map((a) => (a.id === id ? { ...a, ...p } : a)))

  return (
    <>
      <Field label="Parent">
        <Select
          value={pin.parent ?? ''}
          options={[
            { value: '', label: 'None' },
            ...parentOptions(asset.puppet.pins, pin).map((p) => ({ value: p.id, label: p.name ?? 'Pin' })),
          ]}
          onChange={(v) =>
            edit((d) => {
              const p = d.puppet.pins.find((x) => x.id === pin.id)
              if (!p) return
              if (v) p.parent = v
              else delete p.parent
            })
          }
        />
      </Field>
      <p className="pb-1 text-[11px] text-[var(--color-muted)]">
        A pin follows its parent and swings around it — hand → elbow → shoulder.
      </p>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text)]">
          {motion ? `Loops in “${motion.name}”` : 'Loops'}
        </span>
        {motion && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                title="Add a loop to this pin"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
              >
                <Plus size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-1 shadow-2xl"
              >
                {PIN_PRESET_LIST.map((d) => (
                  <DropdownMenu.Item
                    key={d.id}
                    onSelect={() =>
                      setLoops([
                        ...loops,
                        {
                          id: nanoid(8),
                          preset: d.id as PinPresetId,
                          enabled: true,
                          period: d.defaultPeriod,
                          periodUnit: 'beat',
                          params: {},
                        },
                      ])
                    }
                    className="cursor-pointer rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-[var(--color-panel-2)]"
                  >
                    <div className="text-sm text-[var(--color-text)]">{d.label}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">{d.hint}</div>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
      {!motion && (
        <p className="text-[11px] text-[var(--color-muted)]">Select a motion on the left to give this pin loops.</p>
      )}
      {motion && loops.length === 0 && (
        <p className="text-[11px] text-[var(--color-muted)]">None yet — + to add a swing, bob, circle or beat bounce.</p>
      )}
      {loops.map((a) => {
        const def = PIN_PRESETS[a.preset]
        return (
          <div key={a.id} className="mt-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel-2)]/40 px-2 py-1">
            <div className="flex items-center gap-1">
              <span className={`min-w-0 flex-1 truncate text-xs ${a.enabled ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]'}`}>
                {def?.label ?? a.preset}
              </span>
              <Toggle value={a.enabled} onChange={(v) => setOne(a.id, { enabled: v })} />
              <button
                title="Remove loop"
                onClick={() => setLoops(loops.filter((x) => x.id !== a.id))}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {def?.needsParent && !pin.parent && (
              <p className="text-[11px] text-amber-400">Swing needs a parent pin to rotate around — pick one above.</p>
            )}
            <Timing asset={asset} period={a.period} periodUnit={a.periodUnit} phaseOffset={a.phaseOffset} onChange={(p) => setOne(a.id, p)} />
            {def && (
              <ParamControls
                controls={def.controls}
                params={{ ...def.defaults, ...a.params }}
                onChange={(k, v) => setOne(a.id, { params: { ...a.params, [k]: v } })}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
