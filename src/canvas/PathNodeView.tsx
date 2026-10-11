import { useMemo, useRef } from 'react'
import { Path, Shape } from 'react-konva'
import type { PathNode } from '../render/paths'
import { batchSceneFunc, canBatch, segsSceneFunc, StyleCache, type BatchItem } from '../render/segShape'

/** One vector path: stored geometry as a Konva.Path, animated geometry as segments. */
export function PathNodeView({ node, listening }: { node: PathNode; listening?: boolean }) {
  const scene = useMemo(() => (node.segs ? segsSceneFunc(node.segs) : undefined), [node.segs])
  if (scene) return <Shape {...node.config} sceneFunc={scene} listening={listening} />
  return <Path {...node.config} listening={listening} />
}

/**
 * A layer's paths. Animated character frames draw in a single node (React and
 * Konva would otherwise update hundreds of nodes per frame); everything else
 * keeps one Konva.Path per path, exactly as before.
 */
export function PathNodesView({ nodes, listening }: { nodes: PathNode[]; listening?: boolean }) {
  const styles = useRef(new StyleCache())
  const batched = nodes.length > 0 && canBatch(nodes)
  const scene = useMemo(
    () => (batched ? batchSceneFunc(nodes as BatchItem[], styles.current) : undefined),
    [batched, nodes],
  )
  if (scene) return <Shape sceneFunc={scene} listening={false} />
  return (
    <>
      {nodes.map((p) => (
        <PathNodeView key={p.key} node={p} listening={listening} />
      ))}
    </>
  )
}
