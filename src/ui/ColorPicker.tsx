import { useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { formatColor, parseColor, type RGBA } from '../svg/color'
import { Slider } from './controls'

// Light/dark checkerboard so transparency is visible behind a colour.
const CHECKER =
  'repeating-conic-gradient(#bfc3cc 0% 25%, #f4f4f6 0% 50%) 50% / 8px 8px'

const toRGBA = (value: string | undefined): RGBA => parseColor(value ?? '') ?? { r: 0, g: 0, b: 0, a: 1 }
const opaqueHex = (c: RGBA) => formatColor({ ...c, a: 1 })

/** A colour chip over a checkerboard: what the colour, including its transparency, looks like. */
export function ColorChip({ value, className = 'h-7 w-7' }: { value: string; className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-md border border-[var(--color-border)] ${className}`} style={{ background: CHECKER }}>
      <span className="absolute inset-0" style={{ background: value }} />
    </span>
  )
}

/**
 * Colour picker with opacity, used by every colour field. `onChange` gets
 * `#rrggbb` or `#rrggbbaa`; `alphaChanged` says whether the opacity was touched,
 * so palette swatches can keep each path's own alpha when only the hue changed.
 */
export function ColorPicker({
  value,
  onChange,
  title,
  chipClassName,
}: {
  value: string
  onChange: (color: string, info: { alphaChanged: boolean }) => void
  title?: string
  chipClassName?: string
}) {
  const c = toRGBA(value)
  const [hex, setHex] = useState(value)
  useEffect(() => setHex(value), [value])
  const emit = (next: RGBA, alphaChanged: boolean) => onChange(formatColor(next), { alphaChanged })

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button title={title ?? value} className="shrink-0 cursor-pointer rounded-md p-0 outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]">
          <ColorChip value={value} className={chipClassName} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center gap-2">
            <input
              type="color"
              aria-label="Colour"
              value={opaqueHex(c)}
              onChange={(e) => emit({ ...toRGBA(e.target.value), a: c.a }, false)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-0.5"
            />
            <input
              aria-label="Hex"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => {
                const parsed = parseColor(hex)
                if (parsed) emit(parsed, parsed.a !== c.a)
                else setHex(value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              className="h-7 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-[var(--color-muted)]">Opacity</span>
            <Slider value={c.a} min={0} max={1} step={0.01} onChange={(a) => emit({ ...c, a }, true)} />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--color-muted)]">
              {Math.round(c.a * 100)}%
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => emit({ ...c, a: 0 }, true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
            >
              <ColorChip value="transparent" className="h-3.5 w-3.5" /> Transparent
            </button>
            {c.a < 1 && (
              <button
                onClick={() => emit({ ...c, a: 1 }, true)}
                className="flex-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
              >
                Solid
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
