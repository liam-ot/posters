import { Path, Rect } from 'react-konva'
import type { ShapeLayer } from '../types/poster'
import { pathNodeConfigs } from '../render/paths'

/**
 * Vector content of a shape layer. The transparent rect gives the layer a
 * click target and a selection box equal to its full w×h box (a thin squiggle
 * or a star's concave gaps would otherwise be hard to grab). It draws nothing,
 * so it isn't part of the shared render configs.
 */
export function PathsContent({ layer }: { layer: ShapeLayer }) {
  return (
    <>
      <Rect width={layer.width} height={layer.height} fill="rgba(0,0,0,0)" />
      {pathNodeConfigs(layer).map((p) => (
        <Path key={p.key} {...p.config} />
      ))}
    </>
  )
}
