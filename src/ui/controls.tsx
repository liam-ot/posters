import * as RSlider from '@radix-ui/react-slider'
import { useEffect, useState } from 'react'

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="w-20 shrink-0 text-xs text-[var(--color-muted)]">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {children}
      </div>
    </label>
  )
}

const inputClass =
  'h-7 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]'

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
  const [local, setLocal] = useState(String(value))
  useEffect(() => setLocal(String(value)), [value])

  const commit = () => {
    let n = parseFloat(local)
    if (Number.isNaN(n)) {
      setLocal(String(value))
      return
    }
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    onChange(n)
  }

  return (
    <div className="relative w-full">
      <input
        type="number"
        className={inputClass}
        value={local}
        step={step}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
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

export function ColorInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex w-full items-center gap-1.5">
      <input
        type="color"
        value={value?.slice(0, 7) || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-0.5"
      />
      <TextInput value={value} onChange={onChange} />
    </div>
  )
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <RSlider.Root
      className="relative flex h-7 w-full touch-none items-center"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
    >
      <RSlider.Track className="relative h-1 grow rounded-full bg-[var(--color-border)]">
        <RSlider.Range className="absolute h-full rounded-full bg-[var(--color-accent)]" />
      </RSlider.Track>
      <RSlider.Thumb className="block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-panel)] outline-none" />
    </RSlider.Root>
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
