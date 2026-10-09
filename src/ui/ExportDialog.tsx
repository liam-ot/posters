import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Check, Download, Film, Loader2 } from 'lucide-react'
import { useEditor } from '../store/editor'
import { exportImageToRoot } from '../export/image'
import { exportVideoToRoot } from '../export/video'
import { Segmented, Select } from './controls'

type Format = 'png' | 'jpg' | 'mp4'

export function ExportDialog() {
  const doc = useEditor((s) => s.doc)
  const [format, setFormat] = useState<Format>('png')
  const [scale, setScale] = useState(1)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<string | null>(null)

  if (!doc) return null
  const w = Math.round(doc.artboard.width * scale)
  const h = Math.round(doc.artboard.height * scale)
  const isVideo = format === 'mp4'
  const frameCount = Math.max(
    1,
    Math.round(doc.timeline.durationSec * doc.timeline.fps),
  )

  const run = async () => {
    setBusy(true)
    setResult(null)
    setProgress(0)
    const r = isVideo
      ? await exportVideoToRoot(doc, { scale, onProgress: setProgress })
      : await exportImageToRoot(doc, { format, scale })
    setBusy(false)
    setResult(r.path ? `Saved ${r.path}` : `Error: ${r.error ?? 'failed'}`)
  }

  return (
    <Dialog.Root onOpenChange={() => setResult(null)}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
          <Download size={15} /> Export
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-2xl">
          <Dialog.Title className="mb-4 text-sm font-semibold text-[var(--color-text)]">
            Export poster
          </Dialog.Title>

          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs text-[var(--color-muted)]">Format</p>
              <Segmented
                value={format}
                options={[
                  { value: 'png', label: 'PNG' },
                  { value: 'jpg', label: 'JPG' },
                  { value: 'mp4', label: 'MP4' },
                ]}
                onChange={(v) => setFormat(v)}
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs text-[var(--color-muted)]">
                Resolution
              </p>
              <Select
                value={String(scale)}
                options={[
                  { value: '1', label: '1× (native)' },
                  { value: '2', label: '2×' },
                  { value: '3', label: '3×' },
                ]}
                onChange={(v) => setScale(Number(v))}
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {w} × {h} px
                {isVideo &&
                  ` · ${doc.timeline.durationSec}s · ${doc.timeline.fps} fps · ${frameCount} frames`}
              </p>
            </div>

            {busy && isVideo && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                <div
                  className="h-full bg-[var(--color-accent)] transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}

            <button
              onClick={run}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {isVideo
                    ? `Rendering ${Math.round(progress * 100)}%…`
                    : 'Exporting…'}
                </>
              ) : (
                <>
                  {isVideo ? <Film size={15} /> : <Download size={15} />}
                  {isVideo ? 'Render & save MP4' : 'Save to project root'}
                </>
              )}
            </button>

            {result && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                {result.startsWith('Saved') && (
                  <Check size={13} className="text-green-400" />
                )}
                {result}
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
