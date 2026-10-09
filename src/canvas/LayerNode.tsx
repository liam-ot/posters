import type Konva from 'konva'
import { Ellipse, Group, Image as KonvaImage, Rect, Text } from 'react-konva'
import type { GeneratorLayer, ImageLayer, Layer, StrokeStyle } from '../types/poster'
import { useImage } from './useImage'
import { GeneratorContent } from './GeneratorContent'
import { measureTextHeight } from './textMetrics'
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
    }
  }

  return (
    <Group
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
      {content()}
    </Group>
  )
}
