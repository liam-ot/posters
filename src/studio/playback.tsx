import { useEffect } from 'react'
import { Pause, Play, SkipBack } from 'lucide-react'
import type { TimelineConfig } from '../types/poster'
import type { PuppetAsset } from '../puppet/types'
import { useTimeline } from '../store/timeline'
import { NumberInput } from '../ui/controls'
import { useStudio } from './store'
import { contextFor, periodSeconds } from '../animation/timing'
import { PIN_PRESETS } from '../puppet/pinPresets'

/** The studio's preview timeline: its own BPM and length, saved with the character. */
export function previewTimeline(asset: PuppetAsset): TimelineConfig {
  const bpm = asset.preview?.bpm ?? 120
  const beatsPerBar = asset.preview?.beatsPerBar ?? 4
  return {
    durationSec: asset.preview?.durationSec ?? ((60 / bpm) * beatsPerBar * 2),
    fps: 30,
    loop: true,
    bpm,
    beatsPerBar,
  }
}

/** Editing poses happens at the start, paused; anywhere else shows the animation. */
export const useEditingPose = () => useTimeline((s) => !s.playing && s.time === 0)

/** rAF clock for the studio preview, looping on its length. */
function useStudioClock(duration: number) {
  const playing = useTimeline((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const t = useTimeline.getState().time + (now - last) / 1000
      last = now
      useTimeline.getState().setTime(t % duration)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration])
}

const btn =
  'flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'

/** Play / rewind / scrub plus the preview tempo, floating over the studio canvas. */
export function StudioPlayback({ asset }: { asset: PuppetAsset }) {
  const tl = previewTimeline(asset)
  const barSec = (60 / tl.bpm!) * tl.beatsPerBar!
  useStudioClock(tl.durationSec)
  const time = useTimeline((s) => s.time)
  const playing = useTimeline((s) => s.playing)
  const setTime = useTimeline((s) => s.setTime)
  const toggle = useTimeline((s) => s.toggle)
  const setPlaying = useTimeline((s) => s.setPlaying)
  const edit = useStudio((s) => s.edit)
  const setPreview = (p: Partial<NonNullable<PuppetAsset['preview']>>) =>
    edit((d) => {
      d.preview = { ...d.preview, ...p }
    })

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 shadow-lg">
      <button
        onClick={toggle}
        title={playing ? 'Pause' : 'Play the selected motion'}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90"
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        title="Back to the start — edit poses"
        onClick={() => {
          setPlaying(false)
          setTime(0)
        }}
        className={btn}
      >
        <SkipBack size={15} />
      </button>
      <input
        type="range"
        min={0}
        max={tl.durationSec}
        step={0.01}
        value={Math.min(time, tl.durationSec)}
        onChange={(e) => setTime(parseFloat(e.target.value))}
        className="h-1 w-40 cursor-pointer accent-[var(--color-accent)]"
      />
      <span className="w-14 text-center text-xs tabular-nums text-[var(--color-muted)]">{time.toFixed(1)}s</span>
      <div className="h-6 w-px bg-[var(--color-border)]" />
      <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]" title="Preview tempo; posters use their own BPM">
        <span>BPM</span>
        <div className="w-14">
          <NumberInput value={tl.bpm!} min={20} max={300} onChange={(v) => setPreview({ bpm: v })} />
        </div>
      </label>
      <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
        <span>Bars</span>
        <div className="w-12">
          <NumberInput
            value={Math.round((tl.durationSec / barSec) * 100) / 100}
            min={0.25}
            step={1}
            onChange={(v) => setPreview({ durationSec: v * barSec })}
          />
        </div>
      </label>
    </div>
  )
}

/** One striped lane per loop in the selected motion, with cycle ticks and the playhead. */
export function StudioLanes({ asset }: { asset: PuppetAsset }) {
  const motionId = useStudio((s) => s.motionId)
  const time = useTimeline((s) => s.time)
  const motion = asset.motions.find((m) => m.id === motionId)
  if (!motion) return null
  const tl = previewTimeline(asset)
  const ctx = contextFor(tl, false)
  const lanes: { key: string; label: string; period: number; offset: number; on: boolean }[] = []
  const posed = Object.keys(motion.poses ?? {}).length > 0
  if (motion.poseLoop && posed) {
    lanes.push({
      key: 'pose',
      label: `Pose loop · ${motion.poseLoop.shape}`,
      period: periodSeconds(motion.poseLoop as never, ctx),
      offset: motion.poseLoop.phaseOffset ?? 0,
      on: motion.poseLoop.enabled,
    })
  }
  for (const pin of asset.puppet.pins) {
    for (const a of motion.animations[pin.id] ?? []) {
      lanes.push({
        key: a.id,
        label: `${pin.name ?? 'Pin'} · ${PIN_PRESETS[a.preset]?.label ?? a.preset}`,
        period: periodSeconds(a as never, ctx),
        offset: a.phaseOffset ?? 0,
        on: a.enabled,
      })
    }
  }
  if (lanes.length === 0) return null
  const D = tl.durationSec
  return (
    <div className="max-h-40 overflow-y-auto border-t border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
      {lanes.map((l) => {
        const first = (1 - l.offset) % 1
        const ticks: number[] = []
        for (let k = first; k * l.period <= D + 1e-6; k++) if (k > 1e-6) ticks.push((k * l.period) / D)
        return (
          <div key={l.key} className="flex items-center gap-2 py-0.5">
            <span className="w-44 shrink-0 truncate text-[11px] text-[var(--color-muted)]">{l.label}</span>
            <div
              className={`relative h-4 flex-1 overflow-hidden rounded border border-[var(--color-accent-2)]/40 ${l.on ? '' : 'opacity-35'}`}
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-accent-2) 28%, transparent) 0 6px, color-mix(in srgb, var(--color-accent-2) 14%, transparent) 6px 12px)',
              }}
            >
              {ticks.map((x) => (
                <div key={x} style={{ left: `${x * 100}%` }} className="absolute inset-y-0 w-px bg-[var(--color-accent-2)]/70" />
              ))}
              <div style={{ left: `${(Math.min(time, D) / D) * 100}%` }} className="absolute inset-y-0 w-px bg-[var(--color-accent)]" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
