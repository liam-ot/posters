import { useLayoutEffect, useRef } from 'react'
import type Konva from 'konva'
import { Ellipse, Group, Image as KonvaImage, Rect, Text } from 'react-konva'
import type { GeneratorLayer, ImageLayer, Layer, StrokeStyle } from '../types/poster'
import { useImage } from './useImage'
import { GeneratorContent } from './GeneratorContent'
import { PathsContent } from './PathsContent'
import { measureTextHeight } from './textMetrics'
import { useEditor } from '../store/editor'
import { useTimeline } from '../store/timeline'
import { useUI } from '../store/ui'
import { evaluateLayer, hasActiveAnimations } from '../animation/evaluate'
import { contextFor } from '../animation/timing'
import { animatedGroupConfig } from '../render/transform'
import {
  bitmapConfig,
  borderConfig,
  ellipseConfig,
  layerBorder,
  layerGroupConfig,
  rectConfig,
  textConfig,
} from '../render/configs'

interface Props {
  layer: Layer
  isSelected?: boolean
  editing?: boolean
  onSelect: (id: string, additive: boolean) => void
  onChange: (id: string, patch: Partial<Layer>) => void
  onStartEdit?: (id: string) => void
}

// Node names used to find children during a live transform.
const TEXT_NAME = 'layer-text'
const BORDER_NAME = 'layer-border'

function ImageContent({ layer }: { layer: ImageLayer }) {
  const image = useImage(layer.src)
  return <KonvaImage image={image} {...bitmapConfig(layer)} />
}

/** Border stroked just inside a w×h box (see render/configs). */
function BorderBox({
  w,
  h,
  stroke,
  strokeWidth,
  strokeStyle,
  cornerRadius,
}: {
  w: number
  h: number
  stroke: string
  strokeWidth: number
  strokeStyle?: StrokeStyle
  cornerRadius?: number
}) {
  return (
    <Rect
      name={BORDER_NAME}
      {...borderConfig(w, h, stroke, strokeWidth, strokeStyle, cornerRadius)}
      listening={false}
    />
  )
}

export function LayerNode({
  layer,
  isSelected,
  editing,
  onSelect,
  onChange,
  onStartEdit,
}: Props) {
  const outerRef = useRef<Konva.Group>(null)
  const innerRef = useRef<Konva.Group>(null)

  // Animated values live on the inner group (docs/adr/0003). Only layers with
  // an active animation subscribe to the clock, so static layers don't re-render.
  const animated = hasActiveAnimations(layer)
  const time = useTimeline((s) => (animated ? s.time : 0))
  const timeline = useEditor((s) => s.doc?.timeline)
  const showRest = useUI((s) => s.showRest)
  const frame =
    animated && timeline
      ? evaluateLayer(layer, time, contextFor(timeline, showRest))
      : undefined

  // The Transformer sizes its box from the node's content. Measure the content
  // as authored (ignoring the inner animation transform) so the selection box
  // stays put — and never collapses to nothing at scale 0 — while a layer animates.
  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const base = outer.getClientRect.bind(outer)
    outer.getClientRect = (config) => {
      if (!config?.skipTransform) return base(config)
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const child of inner.getChildren()) {
        if (!child.visible()) continue
        const r = child.getClientRect({
          relativeTo: inner,
          skipShadow: config.skipShadow,
          skipStroke: config.skipStroke,
        })
        if (r.width === 0 && r.height === 0) continue
        minX = Math.min(minX, r.x)
        minY = Math.min(minY, r.y)
        maxX = Math.max(maxX, r.x + r.width)
        maxY = Math.max(maxY, r.y + r.height)
      }
      return minX === Infinity
        ? { x: 0, y: 0, width: 0, height: 0 }
        : { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    return () => {
      outer.getClientRect = base
    }
  }, [])

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
    onSelect(layer.id, e.evt.shiftKey)
  }

  const content = () => {
    // While a text layer is being edited inline, hide the canvas text so the
    // HTML textarea is the only visible copy.
    if (editing && layer.type === 'text') return null
    switch (layer.type) {
      case 'rect':
        return <Rect {...rectConfig(layer)} />
      case 'ellipse':
        return <Ellipse {...ellipseConfig(layer)} />
      case 'text': {
        const border = layerBorder(layer)
        return (
          <>
            <Text name={TEXT_NAME} {...textConfig(layer)} />
            {border && (
              <BorderBox
                w={layer.width}
                h={measureTextHeight(layer, layer.width)}
                {...border}
              />
            )}
          </>
        )
      }
      case 'image': {
        const border = layerBorder(layer)
        return (
          <>
            <ImageContent layer={layer} />
            {border && (
              <BorderBox w={layer.width} h={layer.height} {...border} />
            )}
          </>
        )
      }
      case 'generator':
        return <GeneratorContent layer={layer as GeneratorLayer} />
      case 'shape':
        return <PathsContent layer={layer} />
    }
  }

  return (
    <Group
      ref={outerRef}
      id={layer.id}
      name="layer"
      {...layerGroupConfig(layer)}
      draggable={!layer.locked && isSelected}
      listening={!layer.locked && layer.visible && layer.opacity > 0}
      onMouseDown={handleSelect}
      onTap={handleSelect}
      onDblClick={() => {
        if (layer.type === 'text') onStartEdit?.(layer.id)
      }}
      onDblTap={() => {
        if (layer.type === 'text') onStartEdit?.(layer.id)
      }}
      onDragEnd={(e) =>
        onChange(layer.id, {
          x: Math.round(e.target.x()),
          y: Math.round(e.target.y()),
        })
      }
      onTransform={(e) => {
        // Text resizes by width only — convert the live scale into a wrapping
        // width so the text reflows during the drag (not just on release).
        if (layer.type !== 'text') return
        const node = e.target as Konva.Group
        const textNode = node.findOne<Konva.Text>('.' + TEXT_NAME)
        if (!textNode) return
        const newW = Math.max(20, Math.round(textNode.width() * node.scaleX()))
        node.scaleX(1)
        node.scaleY(1)
        textNode.width(newW)
        const border = node.findOne<Konva.Rect>('.' + BORDER_NAME)
        if (border) {
          const sw = layer.strokeWidth ?? 0
          border.position({ x: sw / 2, y: sw / 2 })
          border.width(Math.max(0, newW - sw))
          border.height(Math.max(0, textNode.height() - sw))
        }
      }}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Group
        if (layer.type === 'text') {
          const textNode = node.findOne<Konva.Text>('.' + TEXT_NAME)
          const newW = textNode ? Math.round(textNode.width()) : layer.width
          node.scaleX(1)
          node.scaleY(1)
          onChange(layer.id, {
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.max(20, newW),
            height: textNode ? Math.ceil(textNode.height()) : layer.height,
            rotation: Math.round(node.rotation()),
          })
          return
        }
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        node.scaleX(1)
        node.scaleY(1)
        onChange(layer.id, {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          width: Math.max(5, Math.round(layer.width * scaleX)),
          height: Math.max(5, Math.round(layer.height * scaleY)),
          rotation: Math.round(node.rotation()),
        })
      }}
    >
      <Group ref={innerRef} {...animatedGroupConfig(layer, frame)}>
        {content()}
      </Group>
    </Group>
  )
}
