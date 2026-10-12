import { useCallback, useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Group, Layer as KLayer, Line, Rect, Stage, Transformer } from 'react-konva'
import { useEditor } from '../store/editor'
import { useUI } from '../store/ui'
import { parseColor } from '../svg/color'
import { useFonts } from '../store/fonts'
import { LayerNode } from './LayerNode'
import { LayerBoundary } from './LayerBoundary'
import { TextEditorOverlay } from './TextEditorOverlay'
import { useContainerSize } from './useContainerSize'
import { setStage } from './stageHandle'

const MIN_SCALE = 0.02
const MAX_SCALE = 8

const ALL_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-right',
  'middle-left',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

// 16 px checkerboard tile for transparent artboard backgrounds.
const checker = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f4f6'
  g.fillRect(0, 0, 16, 16)
  g.fillStyle = '#d6d8de'
  g.fillRect(0, 0, 8, 8)
  g.fillRect(8, 8, 8, 8)
  return c
})()

export function CanvasStage() {
  const doc = useEditor((s) => s.doc)
  const selectedIds = useEditor((s) => s.selectedIds)
  const setSelection = useEditor((s) => s.setSelection)
  const toggleSelection = useEditor((s) => s.toggleSelection)
  const updateLayer = useEditor((s) => s.updateLayer)
  const removeSelected = useEditor((s) => s.removeSelected)
  const fitNonce = useUI((s) => s.fitNonce)
  const fontsVersion = useFonts((s) => s.fontsVersion)

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const contentRef = useRef<Konva.Group>(null)
  const { width: cw, height: ch } = useContainerSize(containerRef)

  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [space, setSpace] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Which center-alignment guides are currently snapped (v = vertical line at
  // x=W/2, h = horizontal line at y=H/2).
  const [snap, setSnap] = useState({ v: false, h: false })

  const selectedLayer =
    selectedIds.length === 1
      ? doc?.layers.find((l) => l.id === selectedIds[0])
      : undefined

  const bgAlpha = parseColor(doc?.artboard.background ?? '')?.a ?? 1
  // Layers that crashed while drawing (skipped, see LayerBoundary).
  const [broken, setBroken] = useState<Set<string>>(new Set())
  const onLayerError = useCallback((id: string, error: Error | null) => {
    setBroken((prev) => {
      const next = new Set(prev)
      if (error) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const brokenNames = (doc?.layers ?? []).filter((l) => broken.has(l.id)).map((l) => l.name)
  const W = doc?.artboard.width ?? 0
  const H = doc?.artboard.height ?? 0

  const fit = useCallback(() => {
    if (!cw || !ch || !W || !H) return
    const pad = 96
    const scale = Math.min((cw - pad) / W, (ch - pad) / H)
    setView({
      scale,
      x: (cw - W * scale) / 2,
      y: (ch - H * scale) / 2,
    })
  }, [cw, ch, W, H])

  // Fit on first measure, artboard size change, or explicit request.
  useEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cw, ch, W, H, fitNonce])

  // Keep the transformer attached to the single selected node.
  useEffect(() => {
    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    if (selectedIds.length === 1 && !editingId) {
      const node = stage.findOne('#' + selectedIds[0])
      tr.nodes(node ? [node] : [])
    } else {
      tr.nodes([])
    }
    tr.getLayer()?.batchDraw()
  }, [selectedIds, doc, editingId])

  // Redraw when fonts finish loading so text measures with the real metrics.
  useEffect(() => {
    stageRef.current?.batchDraw()
  }, [fontsVersion])

  // Expose the live stage for export + thumbnails.
  useEffect(() => {
    setStage(stageRef.current)
    return () => setStage(null)
  }, [doc, cw, ch])

  // Space to pan; Delete/Backspace to remove selection (when not typing).
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable
      )
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        e.preventDefault()
        setSpace(true)
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !isTyping()
      ) {
        // A selected timeline bar means "delete this animation", not the layer.
        const anim = useUI.getState().selectedAnim
        if (anim) {
          useEditor.getState().removeAnimation(anim.layerId, anim.animId)
          useUI.getState().setSelectedAnim(null)
        } else {
          removeSelected()
        }
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [removeSelected])

  // Figma-style navigation: two-finger scroll pans, pinch (which browsers report
  // as wheel + ctrlKey) or ⌘/Ctrl + wheel zooms around the pointer, Shift + wheel
  // pans sideways for mouse wheels.
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const { deltaMode, ctrlKey, metaKey, shiftKey } = e.evt
    // Line-based deltas (some mice / Firefox) → pixels.
    const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1
    let dx = e.evt.deltaX * unit
    let dy = e.evt.deltaY * unit

    if (ctrlKey || metaKey) {
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      // Proportional, so a pinch feels continuous; capped so one wheel notch isn't a leap.
      const factor = Math.exp(-Math.max(-50, Math.min(50, dy)) * 0.01)
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
        const px = (pointer.x - v.x) / v.scale
        const py = (pointer.y - v.y) / v.scale
        return { scale, x: pointer.x - px * scale, y: pointer.y - py * scale }
      })
      return
    }
    if (shiftKey && dx === 0) {
      dx = dy
      dy = 0
    }
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
  }

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (space) return
    if (e.target === e.target.getStage()) {
      setSelection([])
    }
  }

  const onSelectLayer = (id: string, additive: boolean) => {
    if (additive) toggleSelection(id)
    else setSelection([id])
  }

  // Figma-style soft snapping to the artboard's center lines. Runs on the
  // bubbled dragmove of a layer node. Snapping is per-frame (Konva recomputes
  // the drag position from the pointer each frame), so dragging past the
  // threshold releases the snap automatically.
  const SNAP_PX = 25
  const onNodeDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    const content = contentRef.current
    if (node === node.getStage() || !content) return // stage pan, ignore
    const box = node.getClientRect({ relativeTo: content })
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const threshold = SNAP_PX / view.scale
    let dx = 0
    let dy = 0
    const v = Math.abs(cx - W / 2) <= threshold
    const h = Math.abs(cy - H / 2) <= threshold
    if (v) dx = W / 2 - cx
    if (h) dy = H / 2 - cy
    if (dx || dy) node.position({ x: node.x() + dx, y: node.y() + dy })
    setSnap((p) => (p.v === v && p.h === h ? p : { v, h }))
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[var(--color-bg)]"
      style={{ cursor: space ? 'grab' : 'default' }}
    >
      {doc && cw > 0 && ch > 0 && (
        <Stage
          ref={stageRef}
          width={cw}
          height={ch}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          draggable={space}
          onWheel={onWheel}
          onMouseDown={onStageMouseDown}
          onDragMove={onNodeDragMove}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))
            } else {
              setSnap({ v: false, h: false })
            }
          }}
        >
          <KLayer listening={!space}>
            {/* A see-through background shows a checkerboard, as in Figma (editor only, not exported). */}
            {bgAlpha < 1 && (
              <Rect x={0} y={0} width={W} height={H} fillPatternImage={checker as unknown as HTMLImageElement} fillPatternScale={{ x: 1 / view.scale, y: 1 / view.scale }} listening={false} />
            )}
            {/* Artboard backdrop + frame */}
            <Rect
              x={0}
              y={0}
              width={W}
              height={H}
              fill={doc.artboard.background}
              shadowColor="#000000"
              shadowBlur={40}
              shadowOpacity={0.5}
              listening={false}
            />
            {/* Content, clipped to the artboard frame */}
            <Group ref={contentRef} clipX={0} clipY={0} clipWidth={W} clipHeight={H}>
              {doc.layers.map((layer) => (
                <LayerBoundary key={layer.id} layerId={layer.id} resetOn={layer} onError={onLayerError}>
                <LayerNode
                  layer={layer}
                  isSelected={selectedIds.includes(layer.id)}
                  editing={editingId === layer.id}
                  onSelect={onSelectLayer}
                  onChange={updateLayer}
                  onStartEdit={(id) => {
                    setSelection([id])
                    setEditingId(id)
                  }}
                />
                </LayerBoundary>
              ))}
            </Group>
            {/* Center-alignment snap guides */}
            {snap.v && (
              <Line
                points={[W / 2, 0, W / 2, H]}
                stroke="#ff3b30"
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            {snap.h && (
              <Line
                points={[0, H / 2, W, H / 2]}
                stroke="#ff3b30"
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                listening={false}
              />
            )}
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={9}
              anchorStroke="#7c5cff"
              anchorFill="#14161c"
              borderStroke="#7c5cff"
              borderStrokeWidth={1.5}
              rotateAnchorOffset={26}
              // Text boxes resize by width only (height auto-fits the wrapped
              // text); everything else gets the full set of resize handles.
              enabledAnchors={
                selectedLayer?.type === 'text'
                  ? ['middle-left', 'middle-right']
                  : ALL_ANCHORS
              }
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
              }
            />
          </KLayer>
        </Stage>
      )}

      {/* In-place text editor */}
      {(() => {
        if (!editingId || !stageRef.current) return null
        const editLayer = doc?.layers.find((l) => l.id === editingId)
        if (!editLayer || editLayer.type !== 'text') return null
        return (
          <TextEditorOverlay
            layer={editLayer}
            stage={stageRef.current}
            scale={view.scale}
            onCommit={(text) => {
              updateLayer(editingId, { text })
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
          />
        )
      })()}

      {brokenNames.length > 0 && (
        <div className="absolute left-1/2 top-16 z-20 max-w-md -translate-x-1/2 rounded-lg border border-amber-500/40 bg-[var(--color-panel)] px-3 py-2 text-xs text-amber-300 shadow-lg">
          Couldn’t draw {brokenNames.map((n) => `“${n}”`).join(', ')} — the rest of the poster is fine. Undo the last
          change, or select the layer in the list and delete it.
        </div>
      )}

      {/* Zoom indicator */}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-[var(--color-panel)]/80 px-2 py-1 text-xs text-[var(--color-muted)]">
        {Math.round(view.scale * 100)}%
      </div>
    </div>
  )
}
