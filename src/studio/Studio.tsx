import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Plus, RefreshCw, Redo2, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useStudio } from './store'
import { StudioCanvas } from './StudioCanvas'
import { useUI } from '../store/ui'
import { saveAsset } from '../library/api'
import { renderAssetThumbnail } from '../export/thumbnail'
import { collectSwatches, replaceSwatch } from '../svg/palette'
import { Field, PanelSection, Slider, TextInput, Toggle } from '../ui/controls'
import { removePin, setPose } from './pins'
import { isMeshCurrent } from '../puppet/build'
import { rebuildMesh } from './mesh'
import { SwatchGrid } from '../ui/SwatchGrid'
import type { PuppetAsset, PuppetPin } from '../puppet/types'

const iconBtn =
  'flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'

async function persist(asset: PuppetAsset) {
  await saveAsset(asset, await renderAssetThumbnail(asset))
}

/** Debounced save (with thumbnail) of the open character. */
function useStudioAutosave(asset: PuppetAsset | null) {
  useEffect(() => {
    if (!asset) return
    let cancelled = false
    const handle = setTimeout(async () => {
      const thumbnail = await renderAssetThumbnail(asset)
      if (!cancelled) saveAsset(asset, thumbnail)
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [asset])
}

function useStudioShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      const studio = useStudio.getState()
      if ((e.key === 'Delete' || e.key === 'Backspace') && studio.selectedPinId) {
        e.preventDefault()
        const id = studio.selectedPinId
        studio.edit((d) => removePin(d, id))
        studio.selectPin(undefined)
        return
      }
      if (e.key === 'Escape') return studio.selectPin(undefined)
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const t = useStudio.temporal.getState()
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) t.redo()
        else t.undo()
      } else if (k === 'y') {
        e.preventDefault()
        t.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function MotionsPanel({ asset }: { asset: PuppetAsset }) {
  const motionId = useStudio((s) => s.motionId)
  const setMotion = useStudio((s) => s.setMotion)
  const edit = useStudio((s) => s.edit)
  const [renaming, setRenaming] = useState<string | null>(null)

  const row = (selected: boolean) =>
    `group flex h-8 items-center gap-1 rounded-md px-2 text-xs cursor-pointer ${
      selected
        ? 'bg-[var(--color-accent)]/20 text-[var(--color-text)]'
        : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'
    }`

  return (
    <section className="border-b border-[var(--color-border)] p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Motions
        </span>
        <button
          title="Add motion"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
          onClick={() => {
            const id = nanoid(8)
            edit((d) => {
              d.motions.push({ id, name: `Motion ${d.motions.length + 1}`, animations: {} })
            })
            setMotion(id)
            setRenaming(id)
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className={row(motionId === undefined)} onClick={() => setMotion(undefined)}>
        Base pose
      </div>
      {asset.motions.map((m) => (
        <div key={m.id} className={row(motionId === m.id)} onClick={() => setMotion(m.id)}>
          {renaming === m.id ? (
            <input
              autoFocus
              defaultValue={m.name}
              onBlur={(e) => {
                const name = e.target.value.trim()
                if (name && name !== m.name)
                  edit((d) => {
                    d.motions.find((x) => x.id === m.id)!.name = name
                  })
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
              className="h-6 min-w-0 flex-1 rounded bg-[var(--color-panel-2)] px-1 text-xs text-[var(--color-text)] outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setRenaming(m.id)}>
              {m.name}
            </span>
          )}
          <button
            title="Delete motion"
            onClick={(e) => {
              e.stopPropagation()
              if (!confirm(`Delete the “${m.name}” motion? Posters using it will show the character still.`)) return
              edit((d) => {
                d.motions = d.motions.filter((x) => x.id !== m.id)
              })
              if (motionId === m.id) setMotion(undefined)
            }}
            className="hidden h-6 w-6 items-center justify-center rounded-md hover:text-[var(--color-text)] group-hover:flex"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {asset.motions.length === 0 && (
        <p className="px-2 pt-1 text-[11px] text-[var(--color-muted)]">
          Motions are named loops (Idle, Dance…) that posters choose from.
        </p>
      )}
    </section>
  )
}

function PinsPanel({ asset }: { asset: PuppetAsset }) {
  const selectedPinId = useStudio((s) => s.selectedPinId)
  const selectPin = useStudio((s) => s.selectPin)
  const motionId = useStudio((s) => s.motionId)
  const edit = useStudio((s) => s.edit)
  const [renaming, setRenaming] = useState<string | null>(null)
  const pins = asset.puppet.pins
  const motion = asset.motions.find((m) => m.id === motionId)
  const anyPosed = motion
    ? Object.keys(motion.poses ?? {}).length > 0
    : pins.some((p) => p.pose)

  return (
    <section className="p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Pins</span>
        {anyPosed && (
          <button
            title={motion ? `Clear this motion’s poses (back to the base pose)` : 'Put every pin back where it was placed'}
            onClick={() =>
              edit((d) => {
                if (motionId) {
                  const m = d.motions.find((x) => x.id === motionId)
                  if (m) delete m.poses
                } else for (const p of d.puppet.pins) delete p.pose
              })
            }
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
          >
            <RotateCcw size={11} /> Reset pose
          </button>
        )}
      </div>
      {pins.length === 0 && (
        <p className="px-2 text-[11px] text-[var(--color-muted)]">
          No pins yet. Click the artwork to add one — at least one on each part you want to move, and some on parts that
          should stay still.
        </p>
      )}
      {pins.map((pin) => {
        const selected = pin.id === selectedPinId
        return (
          <div
            key={pin.id}
            onClick={() => selectPin(pin.id)}
            className={`group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs ${
              selected
                ? 'bg-[var(--color-accent)]/20 text-[var(--color-text)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${pin.kind === 'starch' ? 'bg-amber-500' : 'border-2 border-[var(--color-accent)] bg-white'}`}
            />
            {renaming === pin.id ? (
              <input
                autoFocus
                defaultValue={pin.name}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== pin.name)
                    edit((d) => {
                      d.puppet.pins.find((x) => x.id === pin.id)!.name = name
                    })
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                className="h-6 min-w-0 flex-1 rounded bg-[var(--color-panel-2)] px-1 text-xs text-[var(--color-text)] outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setRenaming(pin.id)}>
                {pin.name ?? 'Pin'}
              </span>
            )}
            <button
              title="Delete pin"
              onClick={(e) => {
                e.stopPropagation()
                edit((d) => removePin(d, pin.id))
                if (selected) selectPin(undefined)
              }}
              className="hidden h-6 w-6 items-center justify-center rounded-md hover:text-[var(--color-text)] group-hover:flex"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )
      })}
    </section>
  )
}

function PinSection({ asset }: { asset: PuppetAsset }) {
  const selectedPinId = useStudio((s) => s.selectedPinId)
  const motionId = useStudio((s) => s.motionId)
  const edit = useStudio((s) => s.edit)
  const pin = asset.puppet.pins.find((p) => p.id === selectedPinId)
  if (!pin) return null
  const motion = asset.motions.find((m) => m.id === motionId)
  const posed = motion ? !!motion.poses?.[pin.id] : !!pin.pose
  const update = (change: Partial<PuppetPin>) =>
    edit((d) => {
      const p = d.puppet.pins.find((x) => x.id === pin.id)
      if (p) Object.assign(p, change)
    })
  const size = Math.min(asset.size.width, asset.size.height)

  return (
    <PanelSection title={pin.kind === 'starch' ? 'Starch pin' : 'Pin'}>
      <Field label="Name">
        <TextInput value={pin.name ?? ''} onChange={(v) => update({ name: v })} />
      </Field>
      {pin.kind === 'starch' ? (
        <>
          <Field label="Radius">
            <Slider
              value={pin.radius ?? 40}
              min={Math.max(2, size * 0.02)}
              max={size * 0.6}
              step={1}
              onChange={(v) => update({ radius: Math.round(v) })}
            />
          </Field>
          <Field label="Stiffness">
            <Slider value={pin.amount ?? 0.6} min={0.05} max={1} step={0.05} onChange={(v) => update({ amount: v })} />
          </Field>
          <p className="text-[11px] text-[var(--color-muted)]">
            Keeps the area inside the circle from bending — a hat, a face, a logo. It doesn’t hold anything in place.
          </p>
        </>
      ) : (
        <>
          <p className="text-[11px] text-[var(--color-muted)]">
            Drag it on the canvas to pose {motion ? `“${motion.name}”` : 'the base pose'}. Pins you don’t drag hold their
            part of the artwork still.
          </p>
          {posed && (
            <button
              onClick={() => edit((d) => setPose(d, pin.id, motionId, undefined))}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
            >
              <RotateCcw size={12} /> Reset this pin
            </button>
          )}
        </>
      )}
    </PanelSection>
  )
}

function CharacterInspector({ asset }: { asset: PuppetAsset }) {
  const edit = useStudio((s) => s.edit)
  const swatches = useMemo(() => collectSwatches(asset.source.paths), [asset.source.paths])
  return (
    <>
      <PanelSection title="Character">
        <p className="text-xs text-[var(--color-muted)]">
          {Math.round(asset.size.width)} × {Math.round(asset.size.height)} px ·{' '}
          {asset.source.paths.length} path{asset.source.paths.length === 1 ? '' : 's'}
        </p>
      </PanelSection>
      <PanelSection title="Colours">
        {asset.source.importWarnings && asset.source.importWarnings.length > 0 && (
          <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300">
            <p className="mb-0.5 font-medium">Not fully imported:</p>
            <ul className="list-disc pl-4">
              {asset.source.importWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <SwatchGrid
          swatches={swatches}
          onChange={(hex, next) =>
            edit((d) => {
              d.source.paths = replaceSwatch(d.source.paths, hex, next)
            })
          }
        />
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          Changes every poster that uses this character. Posters can also override colours for themselves.
        </p>
      </PanelSection>
    </>
  )
}

function MeshSection({ asset }: { asset: PuppetAsset }) {
  const showMesh = useStudio((s) => s.showMesh)
  const setShowMesh = useStudio((s) => s.setShowMesh)
  const meshMs = useStudio((s) => s.meshMs)
  const [detail, setDetail] = useState(asset.puppet.detail)
  useEffect(() => setDetail(asset.puppet.detail), [asset.puppet.detail])

  // Rebuild once the slider settles: a build takes a noticeable moment.
  useEffect(() => {
    if (detail === asset.puppet.detail) return
    const h = setTimeout(() => rebuildMesh(asset, detail), 250)
    return () => clearTimeout(h)
  }, [detail, asset])

  const mesh = asset.puppet.mesh
  const current = isMeshCurrent(asset)
  return (
    <PanelSection title="Mesh">
      <Field label="Detail">
        <Slider value={detail} min={100} max={600} step={25} onChange={setDetail} />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-[var(--color-muted)]">{detail}</span>
      </Field>
      <Field label="Show mesh">
        <Toggle value={showMesh} onChange={setShowMesh} />
      </Field>
      {mesh && (
        <p className="pt-1 text-[11px] text-[var(--color-muted)]">
          {mesh.tris.length / 3} triangles · {mesh.verts.length / 2} points
          {meshMs !== undefined && ` · built in ${meshMs} ms`}
        </p>
      )}
      {mesh && !current && (
        <>
          <p className="pt-1 text-[11px] text-amber-400">
            The artwork changed since this mesh was built, so it isn’t used. Rebuild it.
          </p>
          <button
            onClick={() => rebuildMesh(asset, detail)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
          >
            <RefreshCw size={12} /> Rebuild mesh
          </button>
        </>
      )}
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        The mesh follows the artwork’s outline; pins bend it. More detail bends more smoothly but costs more per frame.
      </p>
    </PanelSection>
  )
}

/** Puppet studio: rig a library character (docs/plans/puppet-pins.md). */
export function Studio() {
  const asset = useStudio((s) => s.asset)
  const edit = useStudio((s) => s.edit)
  const studioReturn = useUI((s) => s.studioReturn)
  const setView = useUI((s) => s.setView)
  const setGalleryTab = useUI((s) => s.setGalleryTab)
  useStudioAutosave(asset)
  useStudioShortcuts()

  useEffect(() => {
    if (!asset) setView('gallery')
  }, [asset, setView])

  // A character without a mesh gets one on open (a one-off cost, not an undo step).
  const needsMesh = !!asset && !asset.puppet.mesh
  useEffect(() => {
    const a = useStudio.getState().asset
    if (needsMesh && a) rebuildMesh(a, a.puppet.detail, true)
  }, [needsMesh])

  if (!asset) return null

  const back = async () => {
    // Save first, so the poster (or gallery) we return to reads the latest version.
    await persist(asset)
    useStudio.getState().close()
    useStudio.temporal.getState().clear()
    if (studioReturn === 'gallery') setGalleryTab('characters')
    setView(studioReturn)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-3">
        <div className="flex items-center gap-2">
          <button onClick={back} title="Back" className={iconBtn}>
            <ChevronLeft size={18} />
          </button>
          <input
            value={asset.name}
            onChange={(e) =>
              edit((d) => {
                d.name = e.target.value
              })
            }
            className="w-56 rounded-md bg-transparent px-1 text-sm text-[var(--color-text)] outline-none hover:bg-[var(--color-panel-2)] focus:bg-[var(--color-panel-2)]"
          />
          <div className="ml-1 flex items-center">
            <button onClick={() => useStudio.temporal.getState().undo()} title="Undo (⌘Z)" className={iconBtn}>
              <Undo2 size={16} />
            </button>
            <button onClick={() => useStudio.temporal.getState().redo()} title="Redo (⌘⇧Z)" className={iconBtn}>
              <Redo2 size={16} />
            </button>
          </div>
        </div>
        <span className="bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-2)] bg-clip-text text-sm font-bold text-transparent">
          Puppet studio
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-panel)]">
          <MotionsPanel asset={asset} />
          <PinsPanel asset={asset} />
        </aside>
        <main className="relative min-w-0 flex-1">
          <StudioCanvas asset={asset} />
        </main>
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-panel)]">
          <PinSection asset={asset} />
          <MeshSection asset={asset} />
          <CharacterInspector asset={asset} />
        </aside>
      </div>
    </div>
  )
}
