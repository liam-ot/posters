import { useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Circle,
  Image as ImageIcon,
  Maximize2,
  Sparkles,
  Square,
  Type,
  Waves,
  Grid3x3,
  Tv,
} from 'lucide-react'
import { useEditor } from '../store/editor'
import { useUI } from '../store/ui'
import type { GeneratorKind } from '../types/poster'

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
    >
      {children}
    </button>
  )
}

export function Toolbar() {
  const addLayer = useEditor((s) => s.addLayer)
  const requestFit = useUI((s) => s.requestFit)
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      const img = new window.Image()
      img.onload = () =>
        addLayer('image', {
          src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        })
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1 shadow-lg">
      <ToolButton label="Rectangle (R)" onClick={() => addLayer('rect')}>
        <Square size={18} />
      </ToolButton>
      <ToolButton label="Ellipse (O)" onClick={() => addLayer('ellipse')}>
        <Circle size={18} />
      </ToolButton>
      <ToolButton label="Text (T)" onClick={() => addLayer('text')}>
        <Type size={18} />
      </ToolButton>
      <ToolButton label="Image" onClick={() => fileRef.current?.click()}>
        <ImageIcon size={18} />
      </ToolButton>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            title="Add generative effect"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
          >
            <Sparkles size={18} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={8}
            className="z-50 min-w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-1 shadow-2xl"
          >
            {(
              [
                { kind: 'noise', label: 'Noise', icon: <Waves size={15} /> },
                { kind: 'static', label: 'Static', icon: <Tv size={15} /> },
                { kind: 'pattern', label: 'Pattern', icon: <Grid3x3 size={15} /> },
              ] as { kind: GeneratorKind; label: string; icon: React.ReactNode }[]
            ).map((g) => (
              <DropdownMenu.Item
                key={g.kind}
                onSelect={() => addLayer('generator', { generator: g.kind })}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-text)] outline-none data-[highlighted]:bg-[var(--color-panel-2)]"
              >
                {g.icon}
                {g.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="mx-1 h-6 w-px bg-[var(--color-border)]" />

      <ToolButton label="Zoom to fit (⇧1)" onClick={requestFit}>
        <Maximize2 size={18} />
      </ToolButton>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPickImage(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
