import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { AssetSummary, PuppetAsset } from '../puppet/types'
import { assetThumbUrl, assetUsage, deleteAsset, getAsset, listAssets, saveAsset } from '../library/api'
import { assetFromSvg } from '../puppet/convert'
import { renderAssetThumbnail } from '../export/thumbnail'
import { importSvg, SvgParseError } from '../svg/parse'
import { openCharacter } from '../studio/open'
import { SvgImportDialog, type PendingSvg } from './SvgImportDialog'

// Light checkerboard, like the studio: most character art is dark line work.
export const lightChecker = {
  backgroundColor: '#f4f4f6',
  backgroundImage: 'conic-gradient(#e2e2e8 25%, transparent 0 50%, #e2e2e8 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
}

/** The Characters tab of the gallery: library characters (docs/adr/0013). */
export function Library() {
  const [assets, setAssets] = useState<AssetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingSvg | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setAssets(await listAssets())
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = async (svg: NonNullable<PendingSvg['result']>) => {
    const asset = assetFromSvg(svg, nanoid(), new Date().toISOString())
    await saveAsset(asset, await renderAssetThumbnail(asset))
    openCharacter(asset, 'gallery')
  }

  const onPick = async (file: File) => {
    try {
      const result = importSvg(await file.text(), file.name)
      if (result.warnings.length === 0) await create(result)
      else setPending({ fileName: file.name, result })
    } catch (e) {
      setPending({
        fileName: file.name,
        error: e instanceof SvgParseError ? e.message : 'This file could not be read as an SVG.',
      })
    }
  }

  const open = async (id: string) => {
    const asset = await getAsset(id)
    if (asset) openCharacter(asset, 'gallery')
  }

  const duplicate = async (id: string) => {
    const asset = await getAsset(id)
    if (!asset) return
    const now = new Date().toISOString()
    const copy: PuppetAsset = {
      ...structuredClone(asset),
      id: nanoid(),
      name: `${asset.name} copy`,
      version: Date.now(),
      createdAt: now,
      updatedAt: now,
    }
    await saveAsset(copy, await renderAssetThumbnail(copy))
    refresh()
  }

  const remove = async (a: AssetSummary) => {
    const using = await assetUsage(a.id)
    const note = using.length
      ? `\n\nUsed in ${using.length} poster${using.length === 1 ? '' : 's'}: ${using.map((p) => p.name).join(', ')}. They keep their copy, unlinked.`
      : ''
    if (!confirm(`Delete “${a.name}”? This can’t be undone.${note}`)) return
    await deleteAsset(a.id)
    refresh()
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-[var(--color-muted)]">
          Characters are rigged once in the puppet studio and reused across posters.
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={16} /> New character from SVG
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onPick(f)
            e.target.value = ''
          }}
        />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="py-24 text-center text-[var(--color-muted)]">
          No characters yet. Start from an SVG file, or use “Open in puppet studio” on an SVG layer in a poster.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <div key={a.id} className="group flex flex-col gap-2">
              <button
                onClick={() => open(a.id)}
                style={lightChecker}
                className="relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] p-4 transition-colors hover:border-[var(--color-accent)]"
              >
                <img
                  src={assetThumbUrl(a.id, a.updatedAt)}
                  alt={a.name}
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.visibility = 'hidden'
                  }}
                />
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <span
                    role="button"
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicate(a.id)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"
                  >
                    <Copy size={14} />
                  </span>
                  <span
                    role="button"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(a)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white hover:bg-red-500/80"
                  >
                    <Trash2 size={14} />
                  </span>
                </div>
              </button>
              <div className="px-0.5">
                <p className="truncate text-sm text-[var(--color-text)]">{a.name}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {a.motions} motion{a.motions === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <SvgImportDialog
        pending={pending}
        onClose={() => setPending(null)}
        onKeepVector={() => {
          const r = pending?.result
          setPending(null)
          if (r) void create(r)
        }}
      />
    </>
  )
}
