import { useEffect, useRef } from 'react'
import type Konva from 'konva'
import type { TextLayer } from '../types/poster'

interface Props {
  layer: TextLayer
  stage: Konva.Stage
  scale: number
  onCommit: (text: string) => void
  onCancel: () => void
}

/** HTML textarea overlaid on the canvas for in-place text editing. */
export function TextEditorOverlay({
  layer,
  stage,
  scale,
  onCommit,
  onCancel,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const node = stage.findOne('#' + layer.id)
  const pos = node ? node.getAbsolutePosition() : { x: 0, y: 0 }

  // Grow the textarea to fit its content so multi-line edits stay visible even
  // when the box started sized to a single line.
  const autoGrow = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, layer.height * scale)}px`
  }

  useEffect(() => {
    const el = ref.current
    if (el) {
      el.focus()
      el.select()
      autoGrow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const weight = `${layer.fontStyle === 'italic' ? 'italic ' : ''}${layer.fontWeight}`

  return (
    <textarea
      ref={ref}
      defaultValue={layer.text}
      onInput={autoGrow}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
        e.stopPropagation()
      }}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: layer.width * scale,
        height: layer.height * scale,
        transform: `rotate(${layer.rotation}deg)`,
        transformOrigin: 'top left',
        font: `${weight} ${layer.fontSize * scale}px ${layer.fontFamily}`,
        lineHeight: String(layer.lineHeight),
        letterSpacing: `${layer.letterSpacing * scale}px`,
        color: layer.fill,
        textAlign: layer.align,
        background: 'transparent',
        border: '1px solid var(--color-accent)',
        outline: 'none',
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        zIndex: 20,
      }}
    />
  )
}
