import type { Swatch } from '../svg/palette'
import { formatColor, parseColor } from '../svg/color'
import { ColorPicker } from './ColorPicker'

/**
 * Canva-style palette: one swatch per unique colour with its use count.
 * `display` lets a caller show an override instead of the original colour.
 * `onChange` gets the new colour and, when the opacity was changed, the new
 * opacity — otherwise each use keeps its own.
 */
export function SwatchGrid({
  swatches,
  display,
  onChange,
}: {
  swatches: Swatch[]
  display?: (s: Swatch) => string
  onChange: (hex: string, next: string, alpha: number | undefined) => void
}) {
  if (swatches.length === 0) {
    return <p className="text-[11px] text-[var(--color-muted)]">No colours.</p>
  }
  const shown = (s: Swatch) => display?.(s) ?? formatColor({ ...parseColor(s.hex)!, a: s.alpha })
  return (
    <div className="flex flex-wrap gap-1.5">
      {swatches.map((s) => (
        <div key={s.hex} className="relative">
          <ColorPicker
            value={shown(s)}
            title={`${shown(s)} · used ${s.count}×`}
            onChange={(next, { alphaChanged }) =>
              onChange(s.hex, next, alphaChanged ? (parseColor(next)?.a ?? 1) : undefined)
            }
          />
          <span className="pointer-events-none absolute -right-1 -top-1 min-w-[14px] rounded-full bg-[var(--color-panel-2)] px-1 text-center text-[9px] leading-[14px] text-[var(--color-muted)] ring-1 ring-[var(--color-border)]">
            {s.count}
          </span>
        </div>
      ))}
    </div>
  )
}
