import { useMemo } from 'react'
import { Eye, EyeOff, RotateCcw } from 'lucide-react'
import type { Layer, Paint, SvgLayer, VectorPath } from '../types/poster'
import { collectSwatches, replaceSwatch } from '../svg/palette'
import { parseSvg } from '../svg/parse'
import { replaceRgb, rgbHex } from '../svg/color'
import { NumberInput, PanelSection } from './controls'
import { SwatchGrid } from './SwatchGrid'

const MAX_ROWS = 300

const swatchClass =
  'h-[22px] w-[22px] shrink-0 cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-0.5'

/** A fill/stroke chip: editable for solid paints, a preview for gradients. */
function PaintChip({
  paint,
  label,
  onChange,
}: {
  paint: Paint | null
  label: string
  onChange: (color: string) => void
}) {
  if (!paint) {
    return (
      <span
        title={`No ${label}`}
        className="h-[22px] w-[22px] shrink-0 rounded-md border border-dashed border-[var(--color-border)]"
      />
    )
  }
  if (paint.type === 'solid') {
    return (
      <input
        type="color"
        title={`${label} ${paint.color}`}
        value={rgbHex(paint.color) ?? '#000000'}
        onChange={(e) => onChange(replaceRgb(paint.color, e.target.value))}
        className={swatchClass}
      />
    )
  }
  const stops = paint.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')
  return (
    <span
      title={`${label}: ${paint.type} gradient — change its colours from the palette above`}
      className="h-[22px] w-[22px] shrink-0 rounded-md border border-[var(--color-border)]"
      style={{ background: `linear-gradient(135deg, ${stops})` }}
    />
  )
}

/** Palette swatches + per-path editing for an imported SVG (docs/adr/0008). */
export function SvgSection({
  layer,
  patch,
}: {
  layer: SvgLayer
  patch: (p: Partial<Layer>) => void
}) {
  const swatches = useMemo(() => collectSwatches(layer.paths), [layer.paths])
  const setPaths = (paths: VectorPath[]) => patch({ paths } as Partial<Layer>)
  const updatePath = (i: number, change: Partial<VectorPath>) =>
    setPaths(layer.paths.map((p, k) => (k === i ? { ...p, ...change } : p)))

  const reset = () => {
    try {
      setPaths(parseSvg(layer.sourceSvg, new Map()).paths)
    } catch {
      /* keep current paths if the stored source can't be re-read */
    }
  }

  const shown = layer.paths.slice(0, MAX_ROWS)

  return (
    <>
      <PanelSection title="SVG colours">
        {layer.importWarnings && layer.importWarnings.length > 0 && (
          <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300">
            <p className="mb-0.5 font-medium">Not fully imported:</p>
            <ul className="list-disc pl-4">
              {layer.importWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <SwatchGrid
          swatches={swatches}
          onChange={(hex, next) => setPaths(replaceSwatch(layer.paths, hex, next))}
        />
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Changing a swatch recolours every path that uses it.
        </p>
        <button
          onClick={reset}
          className="mt-2 flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <RotateCcw size={12} /> Reset colours & paths
        </button>
      </PanelSection>

      <PanelSection title={`Paths (${layer.paths.length})`}>
        <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
          {shown.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <button
                title={p.visible ? 'Hide path' : 'Show path'}
                onClick={() => updatePath(i, { visible: !p.visible })}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                {p.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <span
                className={`min-w-0 flex-1 truncate text-xs ${p.visible ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]'}`}
                title={p.name ?? `Path ${i + 1}`}
              >
                {p.name ?? `Path ${i + 1}`}
              </span>
              <PaintChip
                paint={p.fill}
                label="Fill"
                onChange={(color) => updatePath(i, { fill: { type: 'solid', color } })}
              />
              <PaintChip
                paint={p.stroke}
                label="Stroke"
                onChange={(color) => updatePath(i, { stroke: { type: 'solid', color } })}
              />
              <div className="w-11 shrink-0">
                <NumberInput
                  value={p.strokeWidth}
                  min={0}
                  step={0.5}
                  onChange={(v) =>
                    updatePath(i, {
                      strokeWidth: v,
                      // Turning width on for a path with no stroke needs a colour.
                      stroke: p.stroke ?? (v > 0 ? { type: 'solid', color: '#000000' } : null),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
        {layer.paths.length > MAX_ROWS && (
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
            Showing the first {MAX_ROWS} of {layer.paths.length} paths.
          </p>
        )}
      </PanelSection>
    </>
  )
}
