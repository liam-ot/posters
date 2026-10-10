import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'
import type { SvgImport } from '../svg/parse'

export interface PendingSvg {
  fileName: string
  result?: SvgImport
  error?: string
}

/** Shown when an SVG imports with warnings, or can't be imported at all. */
export function SvgImportDialog({
  pending,
  onKeepVector,
  onFlatImage,
  onClose,
}: {
  pending: PendingSvg | null
  onKeepVector: () => void
  onFlatImage: () => void
  onClose: () => void
}) {
  return (
    <Dialog.Root open={!!pending} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-2xl">
          <Dialog.Title className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <AlertTriangle size={15} className="text-amber-400" />
            {pending?.error ? 'Couldn’t import this SVG' : 'Imported with some limitations'}
          </Dialog.Title>

          {pending?.error ? (
            <>
              <Dialog.Description className="mb-4 text-xs text-[var(--color-muted)]">
                {pending.fileName}: {pending.error}
              </Dialog.Description>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-white hover:opacity-90"
              >
                OK
              </button>
            </>
          ) : (
            pending?.result && (
              <>
                <Dialog.Description className="mb-2 text-xs text-[var(--color-muted)]">
                  {pending.fileName} has {pending.result.paths.length} editable path
                  {pending.result.paths.length === 1 ? '' : 's'}. Some features aren’t supported yet:
                </Dialog.Description>
                <ul className="mb-4 list-disc space-y-0.5 rounded-md bg-[var(--color-panel-2)] py-2 pl-7 pr-3 text-xs text-[var(--color-text)]">
                  {pending.result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <button
                    onClick={onKeepVector}
                    className="w-full rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Keep as vector
                  </button>
                  <button
                    onClick={onFlatImage}
                    className="w-full rounded-lg border border-[var(--color-border)] py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
                  >
                    Use flat image instead
                  </button>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    A flat image looks exactly like the file, but its paths and colours can’t be edited or animated.
                  </p>
                </div>
              </>
            )
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
