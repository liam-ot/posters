import type { GroupConfig } from 'konva/lib/Group'
import type { Layer } from '../types/poster'
import type { LayerFrame } from '../animation/types'
import { identityFrame } from '../animation/types'

/**
 * Config for the inner "animated" group (docs/adr/0003). Scale and rotation pivot
 * around the layer centre; with an identity frame the net transform is a no-op,
 * so un-animated layers render exactly as before.
 */
export function animatedGroupConfig(
  layer: Pick<Layer, 'width' | 'height'>,
  frame: LayerFrame = identityFrame(),
): GroupConfig {
  const cx = layer.width / 2
  const cy = layer.height / 2
  return {
    x: cx + frame.dx,
    y: cy + frame.dy,
    offsetX: cx,
    offsetY: cy,
    rotation: frame.rotation,
    scaleX: frame.scaleX,
    scaleY: frame.scaleY,
    opacity: frame.opacity,
  }
}
