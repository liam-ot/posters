import type { Swatch } from '../svg/palette'

/**
 * Canva-style palette: one swatch per unique colour with its use count.
 * `display` lets a caller show an override instead of the original colour.
 */
export function SwatchGrid({
  swatches,
  display = (hex) => hex,
  onChange,
}: {
  swatches: Swatch[]
  display?: (hex: string) => string
  onChange: (hex: string, next: string) => void
}) {
  if (swatches.length === 0) {
    return <p className="text-[11px] text-[var(--color-muted)]">No colours.</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {swatches.map((s) => (
        <label key={s.hex} className="relative" title={`${display(s.hex)} · used ${s.count}×`}>
          <input
            type="color"
            value={display(s.hex)}
            onChange={(e) => onChange(s.hex, e.target.value)}
            className="h-7 w-7 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-0.5"
          />
          <span className="pointer-events-none absolute -right-1 -top-1 min-w-[14px] rounded-full bg-[var(--color-panel-2)] px-1 text-center text-[9px] leading-[14px] text-[var(--color-muted)] ring-1 ring-[var(--color-border)]">
            {s.count}
          </span>
        </label>
      ))}
    </div>
  )
}
