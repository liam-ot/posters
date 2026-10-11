import { memo, useMemo } from 'react'
import { Rect } from 'react-konva'
import { PathNodesView } from './PathNodeView'
import type { PathFrame } from '../animation/types'
import { pathNodeConfigs, type PathLayer } from '../render/paths'
import { getPathInfos } from '../render/pathInfo'
import type { UV } from '../puppet/types'

/**
 * Vector content of a shape or SVG layer. The transparent rect gives the layer a
 * click target and a selection box equal to its full w×h box (a thin squiggle
 * or a star's concave gaps would otherwise be hard to grab). It draws nothing,
 * so it isn't part of the shared render configs.
 *
 * Memoised on the layer object: while a layer animates, its parent re-renders
 * every frame with only the inner group's transform changing, and rebuilding
 * (and diffing) hundreds of path nodes each frame was wasted work. Layers with
 * path-level animation pass new `frames` every tick and so do re-render.
 */
export const PathsContent = memo(function PathsContent({
  layer,
  frames,
  pins,
}: {
  layer: PathLayer
  frames?: PathFrame[]
  /** A character's animated pins this frame. */
  pins?: Map<string, UV>
}) {
  const paths = useMemo(
    () => pathNodeConfigs(layer, frames, frames ? getPathInfos(layer) : undefined, pins),
    [layer, frames, pins],
  )
  return (
    <>
      <Rect width={layer.width} height={layer.height} fill="rgba(0,0,0,0)" />
      <PathNodesView nodes={paths} />
    </>
  )
})
