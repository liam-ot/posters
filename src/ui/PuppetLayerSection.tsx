import { useMemo, useState } from 'react'
import { Link2, Link2Off, PersonStanding, RotateCcw } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { Layer, ShapeLayer, SvgLayer } from '../types/poster'
import type { PuppetLayer } from '../puppet/types'
import { useEditor } from '../store/editor'
import { savePoster } from '../api/posters'
import { renderAssetThumbnail, renderThumbnail } from '../export/thumbnail'
import { getAsset, saveAsset } from '../library/api'
import { assetFromLayer, instanceFromLayer } from '../puppet/convert'
import { relink } from '../puppet/link'
import { openCharacter } from '../studio/open'
import { collectSwatches } from '../svg/palette'
import { Field, PanelSection, Select } from './controls'
import { SwatchGrid } from './SwatchGrid'

const button =
  'flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-panel-2)] disabled:opacity-40'

/** Save the open poster now, so leaving for the studio loses nothing. */
async function saveOpenPoster() {
  const doc = useEditor.getState().doc
  if (doc) await savePoster(doc, await renderThumbnail(doc))
}

/** A linked character instance: motion, colour overrides, link status (docs/adr/0013). */
export function PuppetLayerSection({
  layer,
  patch,
}: {
  layer: PuppetLayer
  patch: (p: Partial<Layer>) => void
}) {
  const replaceLayer = useEditor((s) => s.replaceLayer)
  const [missing, setMissing] = useState(false)
  const { snapshot } = layer
  const swatches = useMemo(() => collectSwatches(snapshot.source.paths), [snapshot.source.paths])
  const overrides = layer.colorOverrides ?? {}

  const setOverride = (hex: string, next: string) => {
    const map = { ...overrides }
    if (next.toLowerCase() === hex.toLowerCase()) delete map[hex]
    else map[hex] = next
    patch({ colorOverrides: Object.keys(map).length ? map : undefined } as Partial<Layer>)
  }

  const editInStudio = async () => {
    const asset = await getAsset(layer.assetId)
    if (!asset) return setMissing(true)
    await saveOpenPoster()
    openCharacter(asset, 'editor')
  }

  const relinkNow = async () => {
    const asset = await getAsset(layer.assetId)
    if (!asset) return setMissing(true)
    replaceLayer(layer.id, relink(layer, asset))
  }

  return (
    <>
      <PanelSection title="Character">
        <p className="mb-2 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          {layer.detached ? <Link2Off size={13} /> : <Link2 size={13} />}
          {layer.detached
            ? `Detached copy of “${snapshot.name}” — library edits don’t reach it.`
            : `Linked to “${snapshot.name}” — updates from the library.`}
        </p>
        <Field label="Motion">
          <Select
            value={layer.motionId ?? ''}
            options={[
              { value: '', label: 'None — still' },
              ...snapshot.motions.map((m) => ({ value: m.id, label: m.name })),
            ]}
            onChange={(v) => patch({ motionId: v || undefined } as Partial<Layer>)}
          />
        </Field>
        {snapshot.motions.length === 0 && (
          <p className="pb-1 text-[11px] text-[var(--color-muted)]">
            This character has no motions yet — add them in the puppet studio.
          </p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button className={button} onClick={editInStudio}>
            <PersonStanding size={13} /> Edit in studio
          </button>
          {layer.detached ? (
            <button className={button} onClick={relinkNow}>
              <Link2 size={13} /> Re-link
            </button>
          ) : (
            <button
              className={button}
              title="Freeze this copy: it stops following edits to the character"
              onClick={() => patch({ detached: true } as Partial<Layer>)}
            >
              <Link2Off size={13} /> Detach
            </button>
          )}
        </div>
        {missing && (
          <p className="mt-2 text-[11px] text-amber-400">
            This character is no longer in the library. The poster keeps its copy.
          </p>
        )}
      </PanelSection>

      <PanelSection title="Colours in this poster">
        <SwatchGrid
          swatches={swatches}
          display={(hex) => overrides[hex] ?? hex}
          onChange={setOverride}
        />
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Only changes this poster. Edit the character to change it everywhere.
        </p>
        {Object.keys(overrides).length > 0 && (
          <button
            className={`${button} mt-2`}
            onClick={() => patch({ colorOverrides: undefined } as Partial<Layer>)}
          >
            <RotateCcw size={12} /> Reset to character colours
          </button>
        )}
      </PanelSection>
    </>
  )
}

/** Turn an SVG or shape layer into a library character, linked in place. */
export function MakeCharacterSection({ layer }: { layer: SvgLayer | ShapeLayer }) {
  const replaceLayer = useEditor((s) => s.replaceLayer)
  const [busy, setBusy] = useState(false)

  const convert = async () => {
    setBusy(true)
    const asset = assetFromLayer(layer, nanoid(), new Date().toISOString())
    await saveAsset(asset, await renderAssetThumbnail(asset))
    replaceLayer(layer.id, instanceFromLayer(layer, asset))
    await saveOpenPoster()
    openCharacter(asset, 'editor')
  }

  return (
    <PanelSection title="Character">
      <button className={`${button} w-full`} disabled={busy} onClick={convert}>
        <PersonStanding size={13} /> Open in puppet studio
      </button>
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        Turns this artwork into a reusable character you can pin, bend and animate. This layer becomes a
        linked copy of it.
      </p>
    </PanelSection>
  )
}
