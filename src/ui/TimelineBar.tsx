import { useEffect } from 'react'
import { Eye, PanelBottomClose, PanelBottomOpen, Pause, Play, RotateCcw } from 'lucide-react'
import { useEditor } from '../store/editor'
import { useTimeline } from '../store/timeline'
import { useUI } from '../store/ui'
import { NumberInput } from './controls'

/** rAF clock that advances the playhead while playing, looping on duration. */
function useClock() {
  const playing = useTimeline((s) => s.playing)
  const setTime = useTimeline((s) => s.setTime)
  const setPlaying = useTimeline((s) => s.setPlaying)
  const duration = useEditor((s) => s.doc?.timeline.durationSec ?? 5)
  const loop = useEditor((s) => s.doc?.timeline.loop ?? true)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      let t = useTimeline.getState().time + dt
      if (t >= duration) {
        if (loop) t %= duration
        else {
          setTime(duration)
          setPlaying(false)
          return
        }
      }
      setTime(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration, loop, setTime, setPlaying])
}

export function TimelineBar() {
  useClock()
  const doc = useEditor((s) => s.doc)
  const updateTimeline = useEditor((s) => s.updateTimeline)
  const time = useTimeline((s) => s.time)
  const playing = useTimeline((s) => s.playing)
  const toggle = useTimeline((s) => s.toggle)
  const setTime = useTimeline((s) => s.setTime)
  const showRest = useUI((s) => s.showRest)
  const setShowRest = useUI((s) => s.setShowRest)
  const timelineOpen = useUI((s) => s.timelineOpen)
  const setTimelineOpen = useUI((s) => s.setTimelineOpen)

  if (!doc) return null
  const { durationSec, fps, bpm, beatsPerBar = 4 } = doc.timeline
  const barSec = bpm ? (60 / bpm) * beatsPerBar : 0

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 shadow-lg">
      <button
        onClick={toggle}
        title={playing ? 'Pause' : 'Play'}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90"
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        onClick={() => setTime(0)}
        title="Reset to start"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]"
      >
        <RotateCcw size={15} />
      </button>

      <button
        onClick={() => setShowRest(!showRest)}
        title="Show rest state — every layer in its final, un-animated layout (easier editing)"
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          showRest
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'
        }`}
      >
        <Eye size={15} />
      </button>

      <button
        onClick={() => setTimelineOpen(!timelineOpen)}
        title={timelineOpen ? 'Hide timeline' : 'Show timeline — animation bars per layer'}
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          timelineOpen
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text)]'
        }`}
      >
        {timelineOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
      </button>

      <input
        type="range"
        min={0}
        max={durationSec}
        step={0.01}
        value={Math.min(time, durationSec)}
        onChange={(e) => setTime(parseFloat(e.target.value))}
        className="h-1 w-48 cursor-pointer accent-[var(--color-accent)]"
      />
      <span className="w-16 text-center text-xs tabular-nums text-[var(--color-muted)]">
        {time.toFixed(1)}s / {Number(durationSec.toFixed(2))}s
      </span>

      <div className="h-6 w-px bg-[var(--color-border)]" />

      <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
        <span>Dur</span>
        <div className="w-14">
          <NumberInput
            value={Math.round(durationSec * 1000) / 1000}
            min={0.5}
            step={0.5}
            onChange={(v) => updateTimeline({ durationSec: v })}
            suffix="s"
          />
        </div>
      </label>
      <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
        <span>FPS</span>
        <div className="w-12">
          <NumberInput
            value={fps}
            min={1}
            max={60}
            onChange={(v) => updateTimeline({ fps: Math.round(v) })}
          />
        </div>
      </label>

      <div className="h-6 w-px bg-[var(--color-border)]" />

      <label
        className="flex items-center gap-1 text-xs text-[var(--color-muted)]"
        title="Tempo for beat-synced loops. 0 = off"
      >
        <span>BPM</span>
        <div className="w-14">
          <NumberInput
            value={bpm ?? 0}
            min={0}
            max={300}
            onChange={(v) => updateTimeline({ bpm: v > 0 ? v : undefined })}
          />
        </div>
      </label>
      {bpm && (
        <>
          <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <span>Beats/bar</span>
            <div className="w-12">
              <NumberInput
                value={beatsPerBar}
                min={1}
                max={16}
                onChange={(v) => updateTimeline({ beatsPerBar: Math.round(v) })}
              />
            </div>
          </label>
          <label
            className="flex items-center gap-1 text-xs text-[var(--color-muted)]"
            title="Set the duration to a whole number of bars so loops line up"
          >
            <span>Bars</span>
            <div className="w-14">
              <NumberInput
                value={Math.round((durationSec / barSec) * 100) / 100}
                min={0.25}
                step={1}
                onChange={(v) =>
                  // Exact, not rounded: a whole number of bars must divide the loops exactly.
                  updateTimeline({ durationSec: v * barSec })
                }
              />
            </div>
          </label>
        </>
      )}
    </div>
  )
}
