import * as RSlider from '@radix-ui/react-slider'
import { useEffect, useState } from 'react'
import { ColorPicker } from './ColorPicker'

export function Field({
  label,
  compact,
  children,
}: {
  label: string
  /** Label only as wide as its text (e.g. X / Y / W / H), leaving the room to the input. */
  compact?: boolean
  children: React.ReactNode
}) {
  // A div, not a <label>: clicking a slider inside a label would hand focus to its
  // number field, so the arrow keys would stop moving the slider.
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className={`${compact ? 'w-3' : 'w-20'} shrink-0 text-xs text-[var(--color-muted)]`}>
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {children}
      </div>
    </div>
  )
}

const inputClass =
  'h-7 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

/** Decimal places a step needs (0.25 → 2, 0.1 → 1, 5 → 0). */
const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length

/** Round off float noise (0.1 + 0.2) to a sensible number of places. */
const tidy = (n: number, decimals: number) => Number(n.toFixed(Math.min(6, decimals)))

/** Arrow-key multiplier: Shift = 10 steps, Alt = a tenth of a step (Figma-style). */
const stepScale = (e: { shiftKey: boolean; altKey: boolean }) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1)

/**
 * A number field: type a value (Enter or blur commits), or ↑ / ↓ to step it
 * (Shift ×10, Alt ×0.1).
 */
export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  // Rounded so dragged values like 123.456789 stay readable, with a place to
  // spare for Alt's tenth-steps (0.505 on a 0.05 step).
  const places = Math.max(2, decimalsOf(step) + 1)
  const shown = String(tidy(value, places))
  const [local, setLocal] = useState(shown)
  useEffect(() => setLocal(shown), [shown])

  const clamp = (n: number) => {
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    return n
  }

  const commit = () => {
    if (local === shown) return // unchanged: keep the full-precision value
    const n = parseFloat(local)
    if (Number.isNaN(n)) {
      setLocal(shown)
      return
    }
    onChange(clamp(n))
  }

  return (
    <div className="relative w-full">
      <input
        type="text"
        inputMode="decimal"
        className={inputClass + ' tabular-nums' + (suffix ? ' pr-7' : '')}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          else if (e.key === 'Escape') {
            setLocal(shown)
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const base = parseFloat(local)
            const delta = step * stepScale(e) * (e.key === 'ArrowUp' ? 1 : -1)
            const next = clamp(tidy((Number.isNaN(base) ? value : base) + delta, places + 1))
            setLocal(String(next))
            onChange(next)
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-muted)]">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <input
      className={inputClass}
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onChange(local)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/** A colour field: picker (with opacity) + text. Accepts hex, #rrggbbaa, rgba() and `transparent`. */
export function ColorInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex w-full items-center gap-1.5">
      <ColorPicker value={value || '#000000'} onChange={(c) => onChange(c)} />
      <TextInput value={value} onChange={onChange} />
    </div>
  )
}

/**
 * A slider with a number field beside it. Drag, type a value, or focus the
 * slider and use ← / → (Shift ×10, Alt ×0.1). `display` scales what the field
 * shows, e.g. 100 with suffix "%" for a 0..1 opacity.
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  display = 1,
  suffix,
  field = true,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  display?: number
  suffix?: string
  /** Show the number field (off where the caller shows the value itself). */
  field?: boolean
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <>
      <RSlider.Root
        className="relative flex h-7 w-full touch-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        onKeyDown={(e) => {
          // Fine steps with Alt; preventDefault stops Radix applying its own step.
          if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
          e.preventDefault()
          const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1
          onChange(clamp(tidy(value + dir * step * 0.1, decimalsOf(step) + 1)))
        }}
      >
        <RSlider.Track className="relative h-1 grow rounded-full bg-[var(--color-border)]">
          <RSlider.Range className="absolute h-full rounded-full bg-[var(--color-accent)]" />
        </RSlider.Track>
        <RSlider.Thumb className="block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-panel)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40" />
      </RSlider.Root>
      {field && (
        <div className={`${suffix ? 'w-16' : 'w-14'} shrink-0`}>
          <NumberInput
            value={tidy(value * display, decimalsOf(step * display) + 1)}
            step={tidy(step * display, 6)}
            min={tidy(min * display, 6)}
            max={tidy(max * display, 6)}
            suffix={suffix}
            onChange={(v) => onChange(v / display)}
          />
        </div>
      )}
    </>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: React.ReactNode; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex w-full overflow-hidden rounded-md border border-[var(--color-border)]">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex h-7 flex-1 items-center justify-center text-xs transition-colors ${
            value === o.value
              ? 'bg-[var(--color-accent)] text-white'
              : 'bg-[var(--color-panel-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select
      className={inputClass + ' cursor-pointer appearance-none'}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        value ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          value ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export function PanelSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-[var(--color-border)] px-3 py-3">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}
      </h3>
      {children}
    </section>
  )
}
