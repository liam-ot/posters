import type Konva from 'konva'
import { Ellipse, Group, Image as KonvaImage, Rect, Text } from 'react-konva'
import type {
  GeneratorLayer,
  ImageLayer,
  Layer,
  StrokeStyle,
} from '../types/poster'
import { useImage } from './useImage'
import { GeneratorContent } from './GeneratorContent'
import { measureTextHeight } from './textMetrics'
import { strokeDash } from './stroke'

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

/** Build the Konva fontStyle string from weight + italic. */
function fontStyleString(weight: number | string, italic: boolean) {
  return `${italic ? 'italic ' : ''}${weight}`
}

function ImageContent({ layer }: { layer: ImageLayer }) {
  const image = useImage(layer.src)
  return <KonvaImage image={image} width={layer.width} height={layer.height} />
}

/**
 * A border stroked just inside the perimeter of a w×h box. Inset by half the
 * stroke width so the whole stroke sits inside the box edge.
 */
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
  const dash = strokeDash(strokeStyle, strokeWidth)
  return (
    <Rect
      name={BORDER_NAME}
      x={strokeWidth / 2}
      y={strokeWidth / 2}
      width={Math.max(0, w - strokeWidth)}
      height={Math.max(0, h - strokeWidth)}
      stroke={stroke}
      strokeWidth={strokeWidth}
      cornerRadius={cornerRadius}
      dash={dash.dash}
      lineCap={dash.lineCap}
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
      case 'rect': {
        const dash = strokeDash(layer.strokeStyle, layer.strokeWidth ?? 0)
        return (
          <Rect
            width={layer.width}
            height={layer.height}
            fill={layer.fill}
            cornerRadius={layer.cornerRadius}
            stroke={layer.stroke}
            strokeWidth={layer.strokeWidth}
            dash={dash.dash}
            lineCap={dash.lineCap}
          />
        )
      }
      case 'ellipse': {
        const dash = strokeDash(layer.strokeStyle, layer.strokeWidth ?? 0)
        return (
          <Ellipse
            x={layer.width / 2}
            y={layer.height / 2}
            radiusX={layer.width / 2}
            radiusY={layer.height / 2}
            fill={layer.fill}
            stroke={layer.stroke}
            strokeWidth={layer.strokeWidth}
            dash={dash.dash}
            lineCap={dash.lineCap}
          />
        )
      }
      case 'text': {
        const sw = layer.strokeWidth ?? 0
        const bordered = sw > 0 && !!layer.stroke
        return (
          <>
            <Text
              name={TEXT_NAME}
              width={layer.width}
              text={layer.text}
              fontFamily={layer.fontFamily}
              fontSize={layer.fontSize}
              fontStyle={fontStyleString(
                layer.fontWeight,
                layer.fontStyle === 'italic',
              )}
              fill={layer.fill}
              align={layer.align}
              lineHeight={layer.lineHeight}
              letterSpacing={layer.letterSpacing}
              wrap="word"
            />
            {bordered && (
              <BorderBox
                w={layer.width}
                h={measureTextHeight(layer, layer.width)}
                stroke={layer.stroke!}
                strokeWidth={sw}
                strokeStyle={layer.strokeStyle}
              />
            )}
          </>
        )
      }
      case 'image': {
        const sw = layer.strokeWidth ?? 0
        const bordered = sw > 0 && !!layer.stroke
        return (
          <>
            <ImageContent layer={layer} />
            {bordered && (
              <BorderBox
                w={layer.width}
                h={layer.height}
                stroke={layer.stroke!}
                strokeWidth={sw}
                strokeStyle={layer.strokeStyle}
              />
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
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      opacity={layer.visible ? layer.opacity : 0}
      draggable={!layer.locked && isSelected}
      listening={!layer.locked && layer.visible && layer.opacity > 0}
      globalCompositeOperation={layer.blendMode}
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
