import { useMemo, useRef, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import type Konva from 'konva'
import { Circle, Group, Layer, Line, Rect, Shape, Stage } from 'react-konva'
import { PathNodesView } from '../canvas/PathNodeView'
import { useStudio } from './store'
import { isMeshCurrent } from '../puppet/build'
import type { PuppetAsset, UV } from '../puppet/types'
import { locateInMesh, pinPositions, solveMesh } from '../puppet/deform'
import { newPin, setPose, withPose } from './pins'
import { previewTimeline, useEditingPose } from './playback'
import { evaluatePins } from '../puppet/pins'
import { contextFor } from '../animation/timing'
import { useTimeline } from '../store/timeline'
import { previewInstance } from '../puppet/convert'
import { pathNodeConfigs } from '../render/paths'
import { useContainerSize } from '../canvas/useContainerSize'

const PAD = 64

// Light by default (as in image editors): most artwork is dark line work.
const BACKDROPS = {
  light: { base: '#f4f4f6', tile: '#e2e2e8' },
  dark: { base: 'var(--color-bg)', tile: 'var(--color-panel)' },
}

interface Drag {
  pinId: string
  pos: UV
}

/**
 * The character at its natural size on a checkerboard, with its mesh and pins.
 * Click the artwork to add a pin (Alt-click: starch), drag a pin to pose it —
 * the pose of the selected motion, or the base pose (docs/plans/puppet-pins.md).
 */
export function StudioCanvas({ asset }: { asset: PuppetAsset }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [backdrop, setBackdrop] = useState<keyof typeof BACKDROPS>('light')
  const bg = BACKDROPS[backdrop]
  const { width: cw, height: ch } = useContainerSize(containerRef)
  const { width: w, height: h } = asset.size
  const motionId = useStudio((s) => s.motionId)
  const selectedPinId = useStudio((s) => s.selectedPinId)
  const selectPin = useStudio((s) => s.selectPin)
  const showMesh = useStudio((s) => s.showMesh)
  const edit = useStudio((s) => s.edit)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [radiusDrag, setRadiusDrag] = useState<{ pinId: string; radius: number } | null>(null)

  // While dragging, preview the pose without touching the store (one undo step on release).
  const shown = useMemo(
    () => (drag ? withPose(asset, drag.pinId, motionId, drag.pos) : asset),
    [asset, drag, motionId],
  )
  // At the start and paused: edit poses. Anywhere else: show the motion playing.
  const editing = useEditingPose()
  const time = useTimeline((s) => (editing ? 0 : s.time))
  const animated = useMemo(() => {
    if (editing) return undefined
    const ctx = contextFor(previewTimeline(asset), false)
    return evaluatePins(asset, motionId, time, ctx)
  }, [editing, asset, motionId, time])
  const positions = useMemo(() => animated ?? pinPositions(shown, motionId), [animated, shown, motionId])
  const paths = useMemo(
    () => pathNodeConfigs(previewInstance(shown, motionId), undefined, [], animated),
    [shown, motionId, animated],
  )
  const mesh = asset.puppet.mesh
  const current = useMemo(() => isMeshCurrent(asset), [asset])
  const wireVerts = useMemo(
    () => (showMesh && mesh ? (solveMesh(shown, positions) ?? mesh.verts) : null),
    [showMesh, mesh, shown, positions],
  )

  const scale = cw && ch ? Math.min((cw - PAD * 2) / w, (ch - PAD * 2) / h) : 1
  const x = (cw - w * scale) / 2
  const y = (ch - h * scale) / 2
  const toChar = (stage: Konva.Stage): UV | null => {
    const p = stage.getPointerPosition()
    return p ? [(p.x - x) / scale, (p.y - y) / scale] : null
  }

  const onStageDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target.name() === 'pin' || e.target.name() === 'pin-radius') return
    if (!editing) return
    const at = toChar(e.target.getStage()!)
    // Pins only go on the artwork (inside the mesh); elsewhere a click deselects.
    if (!at || !current || !locateInMesh(asset, at[0], at[1])) return selectPin(undefined)
    const pin = newPin(asset, at, e.evt.altKey ? 'starch' : 'pin')
    edit((d) => {
      d.puppet.pins.push(pin)
    })
    selectPin(pin.id)
  }

  // Screen-constant handle sizes.
  const px = (n: number) => n / scale

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        backgroundColor: bg.base,
        backgroundImage: `conic-gradient(${bg.tile} 25%, transparent 0 50%, ${bg.tile} 0 75%, transparent 0)`,
        backgroundSize: '24px 24px',
        cursor: current ? 'crosshair' : 'default',
      }}
    >
      <button
        title={backdrop === 'light' ? 'Dark backdrop' : 'Light backdrop'}
        onClick={() => setBackdrop(backdrop === 'light' ? 'dark' : 'light')}
        className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        {backdrop === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </button>
      <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md bg-[var(--color-panel)]/90 px-2 py-1 text-[11px] text-[var(--color-muted)]">
        {editing ? (
          <>
            Click the artwork to add a pin · Alt-click for a starch pin · drag pins to pose
            {motionId ? ' (this motion)' : ' (base pose)'} · Delete removes
          </>
        ) : (
          'Previewing — press ⏮ to edit poses'
        )}
      </p>
      {cw > 0 && (
        <Stage width={cw} height={ch} onMouseDown={onStageDown}>
          <Layer>
            <Group x={x} y={y} scaleX={scale} scaleY={scale}>
              {/* Character bounds: what an instance's layer box maps onto. */}
              <Rect
                width={w}
                height={h}
                stroke="#7c5cff"
                strokeWidth={1}
                strokeScaleEnabled={false}
                dash={[4, 4]}
                opacity={0.6}
                listening={false}
              />
              <PathNodesView nodes={paths} listening={false} />
              {wireVerts && mesh && <MeshWire verts={wireVerts} tris={mesh.tris} stale={!current} />}

              {asset.puppet.pins.map((pin) => {
                const selected = pin.id === selectedPinId
                if (pin.kind === 'starch') {
                  const r = radiusDrag?.pinId === pin.id ? radiusDrag.radius : (pin.radius ?? 40)
                  return (
                    <Group key={pin.id}>
                      <Circle
                        x={pin.at[0]}
                        y={pin.at[1]}
                        radius={r}
                        stroke="#f59e0b"
                        strokeWidth={selected ? 2 : 1}
                        strokeScaleEnabled={false}
                        dash={[6, 4]}
                        fill="rgba(245,158,11,0.08)"
                        listening={false}
                      />
                      <Circle
                        name="pin"
                        x={pin.at[0]}
                        y={pin.at[1]}
                        radius={px(selected ? 7 : 6)}
                        fill="#f59e0b"
                        stroke="#fff"
                        strokeWidth={2}
                        strokeScaleEnabled={false}
                        onMouseDown={(e) => {
                          e.cancelBubble = true
                          selectPin(pin.id)
                        }}
                      />
                      {selected && (
                        <Circle
                          name="pin-radius"
                          x={pin.at[0] + r}
                          y={pin.at[1]}
                          radius={px(5)}
                          fill="#fff"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeScaleEnabled={false}
                          draggable
                          dragBoundFunc={function (pos) {
                            // Stay on the horizontal through the centre (screen space).
                            return { x: pos.x, y: this.absolutePosition().y }
                          }}
                          onDragMove={(e) =>
                            setRadiusDrag({ pinId: pin.id, radius: Math.max(px(8), e.target.x() - pin.at[0]) })
                          }
                          onDragEnd={(e) => {
                            const radius = Math.round(Math.max(px(8), e.target.x() - pin.at[0]) * 10) / 10
                            setRadiusDrag(null)
                            edit((d) => {
                              const p = d.puppet.pins.find((q) => q.id === pin.id)
                              if (p) p.radius = radius
                            })
                          }}
                        />
                      )}
                    </Group>
                  )
                }
                const pos = drag?.pinId === pin.id ? drag.pos : (positions.get(pin.id) ?? pin.at)
                const posed = pos[0] !== pin.at[0] || pos[1] !== pin.at[1]
                return (
                  <Group key={pin.id}>
                    {/* Where the pin was placed, when it has been moved away from it. */}
                    {posed && (
                      <Line
                        points={[pin.at[0], pin.at[1], pos[0], pos[1]]}
                        stroke="#7c5cff"
                        strokeWidth={1}
                        strokeScaleEnabled={false}
                        dash={[3, 3]}
                        opacity={0.6}
                        listening={false}
                      />
                    )}
                    <Circle
                      name="pin"
                      x={pos[0]}
                      y={pos[1]}
                      radius={px(selected ? 8 : 6.5)}
                      fill={selected ? '#7c5cff' : '#fff'}
                      stroke={selected ? '#fff' : '#7c5cff'}
                      strokeWidth={2.5}
                      strokeScaleEnabled={false}
                      shadowColor="#000"
                      shadowBlur={4}
                      shadowOpacity={0.35}
                      draggable={editing}
                      opacity={editing ? 1 : 0.5}
                      onMouseDown={(e) => {
                        e.cancelBubble = true
                        selectPin(pin.id)
                      }}
                      onDragMove={(e) => setDrag({ pinId: pin.id, pos: [e.target.x(), e.target.y()] })}
                      onDragEnd={(e) => {
                        const end: UV = [e.target.x(), e.target.y()]
                        setDrag(null)
                        edit((d) => setPose(d, pin.id, motionId, end))
                      }}
                    />
                  </Group>
                )
              })}
            </Group>
          </Layer>
        </Stage>
      )}
    </div>
  )
}

/** Triangle wireframe, one draw call, hairline at any zoom. */
function MeshWire({ verts, tris, stale }: { verts: ArrayLike<number>; tris: number[]; stale: boolean }) {
  return (
    <Shape
      listening={false}
      stroke={stale ? '#f59e0b' : '#7c5cff'}
      strokeWidth={1}
      strokeScaleEnabled={false}
      opacity={0.7}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath()
        for (let i = 0; i < tris.length; i += 3) {
          const a = tris[i] * 2
          const b = tris[i + 1] * 2
          const c = tris[i + 2] * 2
          ctx.moveTo(verts[a], verts[a + 1])
          ctx.lineTo(verts[b], verts[b + 1])
          ctx.lineTo(verts[c], verts[c + 1])
          ctx.closePath()
        }
        ctx.strokeShape(shape)
      }}
    />
  )
}
