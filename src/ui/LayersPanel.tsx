import { useState } from 'react'
import {
  Circle,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  Sparkles,
  Square,
  Type,
  Unlock,
} from 'lucide-react'
import type { Layer } from '../types/poster'
import { useEditor } from '../store/editor'

function LayerIcon({ type }: { type: Layer['type'] }) {
  const props = { size: 14 }
  switch (type) {
    case 'rect':
      return <Square {...props} />
    case 'ellipse':
      return <Circle {...props} />
    case 'text':
      return <Type {...props} />
    case 'image':
      return <ImageIcon {...props} />
    case 'generator':
      return <Sparkles {...props} />
  }
}

export function LayersPanel() {
  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const setSelection = useEditor((s) => s.setSelection)
  const toggleSelection = useEditor((s) => s.toggleSelection)
  const updateLayer = useEditor((s) => s.updateLayer)
  const reorderLayer = useEditor((s) => s.reorderLayer)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  if (!doc) return null

  // Display top layer first (array is bottom -> top).
  const display = [...doc.layers].reverse()

  const handleDrop = (displayIndex: number) => {
    if (!dragId) return
    const targetArrayIndex = doc.layers.length - 1 - displayIndex
    reorderLayer(dragId, targetArrayIndex)
    setDragId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Layers
        </span>
        <span className="text-[10px] text-[var(--color-muted)]">
          {doc.layers.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {display.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-[var(--color-muted)]">
            No layers yet. Add shapes, text, or images from the toolbar.
          </p>
        )}
        {display.map((layer, i) => {
          const selected = selectedIds.includes(layer.id)
          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => setDragId(layer.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              onClick={(e) =>
                e.shiftKey ? toggleSelection(layer.id) : setSelection([layer.id])
              }
              className={`group mx-1 flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                selected
                  ? 'bg-[var(--color-accent)]/20 text-[var(--color-text)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]'
              }`}
            >
              <span className="shrink-0 text-[var(--color-muted)]">
                <LayerIcon type={layer.type} />
              </span>

              {editingId === layer.id ? (
                <input
                  autoFocus
                  defaultValue={layer.name}
                  onBlur={(e) => {
                    updateLayer(layer.id, { name: e.target.value })
                    setEditingId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="min-w-0 flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-panel-2)] px-1 text-[var(--color-text)] outline-none"
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate"
                  onDoubleClick={() => setEditingId(layer.id)}
                >
                  {layer.name}
                </span>
              )}

              <button
                title={layer.locked ? 'Unlock' : 'Lock'}
                onClick={(e) => {
                  e.stopPropagation()
                  updateLayer(layer.id, { locked: !layer.locked })
                }}
                className={`shrink-0 ${
                  layer.locked
                    ? 'text-[var(--color-text)]'
                    : 'text-[var(--color-muted)] opacity-0 group-hover:opacity-100'
                }`}
              >
                {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              <button
                title={layer.visible ? 'Hide' : 'Show'}
                onClick={(e) => {
                  e.stopPropagation()
                  updateLayer(layer.id, { visible: !layer.visible })
                }}
                className={`shrink-0 ${
                  layer.visible
                    ? 'text-[var(--color-muted)] opacity-0 group-hover:opacity-100'
                    : 'text-[var(--color-text)]'
                }`}
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
