import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Shapes } from 'lucide-react'
import type { ShapeKind } from '../types/poster'
import { useEditor } from '../store/editor'
import { SHAPE_LIST, generateShape } from '../shapes/library'

const BOX = 40
const PAD = 4

/** Small inline preview drawn from the shape's real geometry. */
function ShapePreview({ kind }: { kind: ShapeKind }) {
  const def = SHAPE_LIST.find((d) => d.kind === kind)!
  const s = (BOX - PAD * 2) / Math.max(def.size.w, def.size.h)
  const w = def.size.w * s
  const h = def.size.h * s
  // Line shapes get a stroke inset by half its width so it stays inside the box.
  const sw = def.line ? 2.5 : 0
  const geoms = generateShape(kind, def.defaults, w - sw, h - sw)
  return (
    <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden>
      <g transform={`translate(${(BOX - w) / 2 + sw / 2} ${(BOX - h) / 2 + sw / 2})`}>
        {geoms.map((g, i) => (
          <path
            key={i}
            d={g.d}
            fillRule={g.fillRule}
            fill={def.line ? 'none' : 'currentColor'}
            stroke={def.line ? 'currentColor' : 'none'}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  )
}

export function ShapeLibraryMenu() {
  const addLayer = useEditor((s) => s.addLayer)
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          title="Add shape"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
        >
          <Shapes size={18} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          className="z-50 w-[216px] rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-2 shadow-2xl"
        >
          <div className="grid grid-cols-4 gap-1">
            {SHAPE_LIST.map((d) => (
              <button
                key={d.kind}
                title={d.label}
                onClick={() => {
                  addLayer('shape', { shape: d.kind })
                  setOpen(false)
                }}
                className="flex aspect-square items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
              >
                <ShapePreview kind={d.kind} />
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
