import { useCallback, useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Group, Layer as KLayer, Line, Rect, Stage, Transformer } from 'react-konva'
import { useEditor } from '../store/editor'
import { useUI } from '../store/ui'
import { useFonts } from '../store/fonts'
import { LayerNode } from './LayerNode'
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
        removeSelected()
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

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const oldScale = view.scale
    const mousePointTo = {
      x: (pointer.x - view.x) / oldScale,
      y: (pointer.y - view.y) / oldScale,
    }
    const factor = 1.05
    const newScale =
      e.evt.deltaY > 0 ? oldScale / factor : oldScale * factor
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale))
    setView({
      scale,
      x: pointer.x - mousePointTo.x * scale,
      y: pointer.y - mousePointTo.y * scale,
    })
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
                <LayerNode
                  key={layer.id}
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

      {/* Zoom indicator */}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-[var(--color-panel)]/80 px-2 py-1 text-xs text-[var(--color-muted)]">
        {Math.round(view.scale * 100)}%
      </div>
    </div>
  )
}
