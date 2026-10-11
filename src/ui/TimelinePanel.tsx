import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Layer, LayerAnimation } from '../types/poster'
import { useEditor } from '../store/editor'
import { useTimeline } from '../store/timeline'
import { useUI } from '../store/ui'
import { PRESETS } from '../animation/presets'
import { fitToBars, retime, rulerStep, type DragMode } from '../animation/retime'
import {
  animationWindow,
  contextFor,
  periodSeconds,
  secPerBeat,
  type EvalContext,
} from '../animation/timing'

const LABEL_W = 152
const LANE_H = 20
const LANE_GAP = 3
const ROW_PAD = 5
const RULER_H = 24

/** In/out share one lane; each loop gets its own. */
function lanesOf(anims: LayerAnimation[]): LayerAnimation[][] {
  const once = anims.filter((a) => a.phase !== 'loop')
  const loops = anims.filter((a) => a.phase === 'loop').map((a) => [a])
  return once.length ? [once, ...loops] : loops
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

interface Drag {
  layerId: string
  anim: LayerAnimation
  mode: DragMode
  x0: number
  patch: Partial<LayerAnimation> | null
}

/** Per-layer animation bars with drag-to-retime and a beat grid (plan Phase 5). */
export function TimelinePanel() {
  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const setSelection = useEditor((s) => s.setSelection)
  const updateLayer = useEditor((s) => s.updateLayer)
  const updateTimeline = useEditor((s) => s.updateTimeline)
  const height = useUI((s) => s.timelineHeight)
  const setHeight = useUI((s) => s.setTimelineHeight)
  const setOpen = useUI((s) => s.setTimelineOpen)

  const trackRef = useRef<HTMLDivElement>(null)
  const trackW = useWidth(trackRef)
  // Mirrored in a ref so pointer handlers never read a stale drag from their closure.
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }

  if (!doc) return null
  const ctx = contextFor(doc.timeline, false)
  const D = ctx.duration
  const pps = trackW > 0 ? trackW / D : 0
  const rows = [...doc.layers].reverse().filter((l) => l.animations?.length)
  const barSec = ctx.bpm ? secPerBeat(ctx.bpm) * ctx.beatsPerBar : 0
  const fitted = ctx.bpm ? fitToBars(D, ctx.bpm, ctx.beatsPerBar) : D

  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY
    const h0 = height
    const move = (ev: PointerEvent) =>
      setHeight(Math.round(Math.min(window.innerHeight * 0.7, Math.max(110, h0 + y0 - ev.clientY))))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const beginDrag = (e: React.PointerEvent, layer: Layer, anim: LayerAnimation, mode: DragMode) => {
    e.stopPropagation()
    setSelection([layer.id])
    if (anim.phase === 'loop') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ layerId: layer.id, anim, mode, x0: e.clientX, patch: null })
  }
  const moveDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || !pps) return
    const dt = (e.clientX - drag.x0) / pps
    setDrag({ ...drag, patch: retime(drag.anim, drag.mode, dt, ctx, !e.altKey) })
  }
  // Commit once on release, so one drag is one undo step.
  const endDrag = () => {
    const drag = dragRef.current
    if (!drag) return
    const { layerId, anim, patch } = drag
    setDrag(null)
    if (!patch) return
    const layer = useEditor.getState().doc?.layers.find((l) => l.id === layerId)
    if (!layer?.animations) return
    updateLayer(layerId, {
      animations: layer.animations.map((a) => (a.id === anim.id ? { ...a, ...patch } : a)),
    })
  }

  return (
    <div
      style={{ height }}
      className="relative flex shrink-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-panel)]"
    >
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        className="absolute inset-x-0 -top-1 z-20 h-2 cursor-row-resize"
      />
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Timeline
        </span>
        {ctx.bpm && (
          <>
            <span className="text-[11px] text-[var(--color-muted)]">
              Snaps to beats · hold Alt for free timing
            </span>
            <button
              disabled={Math.abs(fitted - D) < 1e-6}
              onClick={() => updateTimeline({ durationSec: fitted })}
              title="Round the duration to a whole number of bars so loops line up"
              className="rounded-md px-2 py-0.5 text-[11px] text-[var(--color-text)] hover:bg-[var(--color-panel-2)] disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Fit to {Math.round(fitted / barSec)} bar{Math.round(fitted / barSec) === 1 ? '' : 's'}
            </button>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setOpen(false)}
          title="Close timeline"
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative min-h-full">
          <div className="sticky top-0 z-10 flex border-b border-[var(--color-border)] bg-[var(--color-panel)]">
            <div style={{ width: LABEL_W }} className="shrink-0" />
            <div ref={trackRef} className="relative mr-3 flex-1">
              <Ruler duration={D} pps={pps} ctx={ctx} />
            </div>
          </div>

          {/* Bar lines behind the rows. */}
          {barSec > 0 && pps > 0 && (
            <div
              style={{ left: LABEL_W, top: RULER_H }}
              className="pointer-events-none absolute bottom-0 right-3"
            >
              {Array.from({ length: Math.floor(D / barSec + 1e-6) + 1 }, (_, k) => (
                <div
                  key={k}
                  style={{ left: k * barSec * pps }}
                  className="absolute inset-y-0 w-px bg-[var(--color-border)]"
                />
              ))}
            </div>
          )}

          {rows.length === 0 && (
            <p className="px-3 py-4 text-xs text-[var(--color-muted)]">
              No animated layers yet. Add an animation in the Inspector’s Animation section.
            </p>
          )}

          {rows.map((layer) => {
            const selected = selectedIds.includes(layer.id)
            const lanes = lanesOf(layer.animations ?? [])
            return (
              <div
                key={layer.id}
                onPointerDown={() => setSelection([layer.id])}
                className={`flex border-b border-[var(--color-border)]/60 ${
                  selected ? 'bg-[var(--color-accent)]/10' : ''
                }`}
              >
                <div
                  style={{ width: LABEL_W }}
                  className={`shrink-0 cursor-pointer truncate px-3 pt-1.5 text-xs ${
                    selected ? 'text-[var(--color-text)]' : 'text-[var(--color-muted)]'
                  }`}
                >
                  {layer.name}
                </div>
                <div
                  className="relative mr-3 flex-1"
                  style={{
                    height: lanes.length * (LANE_H + LANE_GAP) - LANE_GAP + ROW_PAD * 2,
                  }}
                >
                  {pps > 0 &&
                    lanes.map((lane, i) =>
                      lane.map((a) => {
                        const live = drag?.anim.id === a.id && drag.patch ? { ...a, ...drag.patch } : a
                        const top = ROW_PAD + i * (LANE_H + LANE_GAP)
                        return a.phase === 'loop' ? (
                          <LoopBar
                            key={a.id}
                            anim={a}
                            top={top}
                            pps={pps}
                            ctx={ctx}
                            onPointerDown={(e) => beginDrag(e, layer, a, 'move')}
                          />
                        ) : (
                          <OnceBar
                            key={a.id}
                            anim={live}
                            top={top}
                            pps={pps}
                            ctx={ctx}
                            dragging={drag?.anim.id === a.id}
                            onPointerDown={(e, mode) => beginDrag(e, layer, a, mode)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                          />
                        )
                      }),
                    )}
                </div>
              </div>
            )
          })}

          {/* Playhead spans the ruler and every row. */}
          <div
            style={{ left: LABEL_W }}
            className="pointer-events-none absolute inset-y-0 right-3 z-20"
          >
            <Playhead pps={pps} duration={D} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Seconds, plus beat ticks and stronger bar lines when a BPM is set. Click/drag scrubs. */
function Ruler({ duration, pps, ctx }: { duration: number; pps: number; ctx: EvalContext }) {
  const setTime = useTimeline((s) => s.setTime)
  const setPlaying = useTimeline((s) => s.setPlaying)
  if (!pps) return <div style={{ height: RULER_H }} />

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTime(Math.min(duration, Math.max(0, (e.clientX - r.left) / pps)))
  }

  const step = rulerStep(pps)
  const labels = Array.from({ length: Math.floor(duration / step + 1e-6) + 1 }, (_, k) => k * step)
  const beat = ctx.bpm ? secPerBeat(ctx.bpm) : 0
  // Skip beat ticks when they'd be too dense to read.
  const beats =
    beat && beat * pps >= 5
      ? Array.from({ length: Math.floor(duration / beat + 1e-6) + 1 }, (_, k) => k)
      : []

  return (
    <div
      style={{ height: RULER_H }}
      className="relative cursor-ew-resize select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setPlaying(false)
        scrub(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e)
      }}
    >
      {beats.map((k) => {
        const bar = k % ctx.beatsPerBar === 0
        return (
          <div
            key={`b${k}`}
            style={{ left: k * beat * pps, height: bar ? 10 : 5 }}
            className={`absolute bottom-0 w-px ${
              bar ? 'bg-[var(--color-accent-2)]/70' : 'bg-[var(--color-muted)]/40'
            }`}
          />
        )
      })}
      {labels.map((s) => (
        <span
          key={`s${s}`}
          style={{ left: s * pps }}
          className={`absolute top-1 text-[10px] tabular-nums text-[var(--color-muted)] ${
            s === 0 ? '' : '-translate-x-1/2'
          }`}
        >
          {Number(s.toFixed(2))}s
        </span>
      ))}
    </div>
  )
}

/** Own component so only the line re-renders every frame during playback. */
function Playhead({ pps, duration }: { pps: number; duration: number }) {
  const time = useTimeline((s) => s.time)
  if (!pps) return null
  return (
    <div
      style={{ left: Math.min(time, duration) * pps }}
      className="absolute inset-y-0 w-px bg-[var(--color-accent)]"
    >
      <div className="absolute -left-[4px] top-0 h-2 w-[9px] rounded-b-sm bg-[var(--color-accent)]" />
    </div>
  )
}

const fmt = (s: number) => `${Number(s.toFixed(2))}s`

function OnceBar({
  anim,
  top,
  pps,
  ctx,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  anim: LayerAnimation
  top: number
  pps: number
  ctx: EvalContext
  dragging: boolean
  onPointerDown: (e: React.PointerEvent, mode: DragMode) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
}) {
  const { start, end } = animationWindow(anim, ctx)
  const label = `${PRESETS[anim.preset]?.label ?? anim.preset} ${anim.phase}`
  const handlers = { onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
  const edge = 'absolute inset-y-0 w-1.5 cursor-ew-resize rounded-sm hover:bg-white/40'

  return (
    <div
      title={`${label}: ${fmt(start)} → ${fmt(end)}`}
      style={{ top, height: LANE_H, left: start * pps, width: Math.max(4, (end - start) * pps) }}
      className={`absolute cursor-grab overflow-hidden rounded-md text-[10px] leading-5 text-white select-none ${
        anim.phase === 'in' ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-accent)]/70'
      } ${anim.enabled ? '' : 'opacity-35'} ${dragging ? 'cursor-grabbing ring-1 ring-white/70' : ''}`}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      {...handlers}
    >
      <span className="pointer-events-none block truncate px-2">
        {dragging ? `${fmt(start)} → ${fmt(end)}` : label}
      </span>
      {/* Captured move/up events bubble to the bar's handlers. */}
      <div className={`${edge} left-0`} onPointerDown={(e) => onPointerDown(e, 'start')} />
      <div className={`${edge} right-0`} onPointerDown={(e) => onPointerDown(e, 'end')} />
    </div>
  )
}

function LoopBar({
  anim,
  top,
  pps,
  ctx,
  onPointerDown,
}: {
  anim: LayerAnimation
  top: number
  pps: number
  ctx: EvalContext
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const period = periodSeconds(anim, ctx)
  const count = Math.floor(ctx.duration / period + 1e-6)
  // Period ticks only while they're far enough apart to see.
  const ticks = period * pps >= 4 ? Array.from({ length: count }, (_, k) => k + 1) : []
  return (
    <div
      title={`${PRESETS[anim.preset]?.label ?? anim.preset} loop, every ${fmt(period)}`}
      style={{
        top,
        height: LANE_H,
        backgroundImage:
          'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-accent-2) 28%, transparent) 0 6px, color-mix(in srgb, var(--color-accent-2) 14%, transparent) 6px 12px)',
      }}
      className={`absolute inset-x-0 cursor-pointer overflow-hidden rounded-md border border-[var(--color-accent-2)]/40 text-[10px] leading-[18px] text-[var(--color-text)] select-none ${
        anim.enabled ? '' : 'opacity-35'
      }`}
      onPointerDown={onPointerDown}
    >
      {ticks.map((k) => (
        <div
          key={k}
          style={{ left: k * period * pps }}
          className="absolute inset-y-0 w-px bg-[var(--color-accent-2)]/70"
        />
      ))}
      <span className="pointer-events-none relative block truncate px-2">
        {PRESETS[anim.preset]?.label ?? anim.preset} loop · {fmt(period)}
      </span>
    </div>
  )
}
