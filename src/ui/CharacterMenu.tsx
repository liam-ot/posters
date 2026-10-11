import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { PersonStanding } from 'lucide-react'
import type { AssetSummary } from '../puppet/types'
import { useEditor } from '../store/editor'
import { assetThumbUrl, getAsset, listAssets } from '../library/api'
import { lightChecker } from './Library'

/** Toolbar popover: place a library character as a linked instance (docs/adr/0013). */
export function CharacterMenu() {
  const addLayer = useEditor((s) => s.addLayer)
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState<AssetSummary[] | null>(null)

  const place = async (id: string) => {
    setOpen(false)
    const asset = await getAsset(id)
    if (asset) addLayer('puppet', { asset })
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Re-list on every open: characters are made in another view.
        if (o) listAssets().then(setAssets)
      }}
    >
      <Popover.Trigger asChild>
        <button
          title="Add character"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
        >
          <PersonStanding size={18} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          className="z-50 w-[264px] rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-2 shadow-2xl"
        >
          {assets === null ? (
            <p className="p-2 text-xs text-[var(--color-muted)]">Loading…</p>
          ) : assets.length === 0 ? (
            <p className="p-2 text-xs text-[var(--color-muted)]">
              No characters yet. Make one from the gallery’s Characters tab, or select an SVG layer and use
              “Open in puppet studio”.
            </p>
          ) : (
            <div className="grid max-h-80 grid-cols-3 gap-1 overflow-y-auto">
              {assets.map((a) => (
                <button
                  key={a.id}
                  title={a.name}
                  onClick={() => place(a.id)}
                  className="flex flex-col items-center gap-1 rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
                >
                  <img
                    src={assetThumbUrl(a.id, a.updatedAt)}
                    alt=""
                    style={lightChecker}
                    className="h-14 w-full rounded object-contain p-1"
                  />
                  <span className="w-full truncate text-center text-[11px]">{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
