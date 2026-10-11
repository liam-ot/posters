import { useMemo, useRef, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Group, Layer, Path, Rect, Stage } from 'react-konva'
import type { PuppetAsset } from '../puppet/types'
import { previewInstance } from '../puppet/convert'
import { pathNodeConfigs } from '../render/paths'
import { useContainerSize } from '../canvas/useContainerSize'

const PAD = 64

// Light by default (as in image editors): most artwork is dark line work.
const BACKDROPS = {
  light: { base: '#f4f4f6', tile: '#e2e2e8' },
  dark: { base: 'var(--color-bg)', tile: 'var(--color-panel)' },
}

/** The character at its natural size, fitted to the view on a checkerboard. */
export function StudioCanvas({ asset }: { asset: PuppetAsset }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [backdrop, setBackdrop] = useState<keyof typeof BACKDROPS>('light')
  const bg = BACKDROPS[backdrop]
  const { width: cw, height: ch } = useContainerSize(containerRef)
  const { width: w, height: h } = asset.size
  const paths = useMemo(() => pathNodeConfigs(previewInstance(asset)), [asset])

  const scale = cw && ch ? Math.min((cw - PAD * 2) / w, (ch - PAD * 2) / h) : 1
  const x = (cw - w * scale) / 2
  const y = (ch - h * scale) / 2

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        backgroundColor: bg.base,
        backgroundImage: `conic-gradient(${bg.tile} 25%, transparent 0 50%, ${bg.tile} 0 75%, transparent 0)`,
        backgroundSize: '24px 24px',
      }}
    >
      <button
        title={backdrop === 'light' ? 'Dark backdrop' : 'Light backdrop'}
        onClick={() => setBackdrop(backdrop === 'light' ? 'dark' : 'light')}
        className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        {backdrop === 'light' ? <Moon size={15} /> : <Sun size={15} />}
      </button>
      {cw > 0 && (
        <Stage width={cw} height={ch}>
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
              {paths.map((p) => (
                <Path key={p.key} {...p.config} listening={false} />
              ))}
            </Group>
          </Layer>
        </Stage>
      )}
    </div>
  )
}
