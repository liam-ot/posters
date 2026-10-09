import * as Popover from '@radix-ui/react-popover'
import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Upload } from 'lucide-react'
import { STANDARD_FONTS } from '../fonts/standard'
import { useFonts } from '../store/fonts'

export function FontPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (family: string) => void
}) {
  const custom = useFonts((s) => s.custom)
  const addCustomFromFile = useFonts((s) => s.addCustomFromFile)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const label = useMemo(() => {
    const std = STANDARD_FONTS.find((f) => f.family === value)
    if (std) return std.label
    const c = custom.find((f) => f.family === value)
    return c ? c.family : value
  }, [value, custom])

  const ql = q.toLowerCase()
  const filteredCustom = custom.filter((f) =>
    f.family.toLowerCase().includes(ql),
  )
  const filteredStd = STANDARD_FONTS.filter((f) =>
    f.label.toLowerCase().includes(ql),
  )

  const apply = (family: string) => {
    onChange(family)
    setOpen(false)
    setQ('')
  }

  const Row = ({
    family,
    text,
  }: {
    family: string
    text: string
  }) => (
    <button
      onClick={() => apply(family)}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
      style={{ fontFamily: family }}
    >
      <span className="truncate">{text}</span>
      {value === family && (
        <Check size={14} className="shrink-0 text-[var(--color-accent)]" />
      )}
    </button>
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="flex h-7 w-full items-center justify-between gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-text)] outline-none hover:border-[var(--color-accent)]"
          style={{ fontFamily: value }}
        >
          <span className="truncate">{label}</span>
          <ChevronDown size={13} className="shrink-0 text-[var(--color-muted)]" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="left"
          align="start"
          sideOffset={8}
          className="z-50 flex max-h-[60vh] w-64 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl"
        >
          <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fonts…"
              className="h-7 min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-panel-2)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              title="Upload font from your computer"
              onClick={() => fileRef.current?.click()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              <Upload size={14} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {filteredCustom.length > 0 && (
              <>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  Custom
                </p>
                {filteredCustom.map((f) => (
                  <Row key={f.id} family={f.family} text={f.family} />
                ))}
              </>
            )}
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Standard
            </p>
            {filteredStd.map((f) => (
              <Row key={f.family} family={f.family} text={f.label} />
            ))}
            {filteredCustom.length === 0 && filteredStd.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-[var(--color-muted)]">
                No fonts match “{q}”.
              </p>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const meta = await addCustomFromFile(f)
              if (meta) apply(meta.family)
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
