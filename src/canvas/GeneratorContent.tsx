import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import { Image as KonvaImage } from 'react-konva'
import type { GeneratorLayer } from '../types/poster'
import { internalSize, renderGenerator } from '../generators/runtime'
import { useTimeline } from '../store/timeline'

export function GeneratorContent({ layer }: { layer: GeneratorLayer }) {
  const imageRef = useRef<Konva.Image>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas')

  // Only animated generators subscribe to the clock (others always read 0).
  const time = useTimeline((s) => (layer.animated ? s.time : 0))

  const paramsKey = JSON.stringify(layer.params)

  useEffect(() => {
    const canvas = canvasRef.current!
    const { iw, ih } = internalSize(layer.width, layer.height)
    if (canvas.width !== iw) canvas.width = iw
    if (canvas.height !== ih) canvas.height = ih
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderGenerator(ctx, iw, ih, layer, time)
    const node = imageRef.current
    if (node) {
      node.image(canvas)
      node.getLayer()?.batchDraw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    layer.generator,
    layer.seed,
    layer.width,
    layer.height,
    paramsKey,
    time,
  ])

  return (
    <KonvaImage
      ref={imageRef}
      image={canvasRef.current}
      width={layer.width}
      height={layer.height}
    />
  )
}
