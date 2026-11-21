import { useMemo, useRef, type ReactNode } from 'react'
import { Path, Shape } from 'react-konva'
import type { PathNode } from '../render/paths'
import { batchSceneFunc, canBatch, segsSceneFunc, StyleCache, type BatchItem } from '../render/segShape'

/**
 * Konva elements for a layer's paths. Animated character frames draw in a single
 * node (React and Konva would otherwise update hundreds of nodes per frame);
 * everything else keeps one Konva.Path per path, exactly as before.
 *
 * A hook, not a component taking `nodes` as a prop: React's development build
 * logs every changed prop of every render and writes arrays out as text, and the
 * per-frame geometry (thousands of numbers per path) exhausted the tab's memory
 * within seconds. Here React only ever sees scene functions.
 */
export function usePathElements(nodes: PathNode[], listening?: boolean): ReactNode {
  const styles = useRef(new StyleCache())
  return useMemo(() => {
    if (nodes.length > 0 && canBatch(nodes)) {
      return <Shape sceneFunc={batchSceneFunc(nodes as BatchItem[], styles.current)} listening={false} />
    }
    return nodes.map((p) =>
      p.segs ? (
        <Shape key={p.key} {...p.config} sceneFunc={segsSceneFunc(p.segs)} listening={listening} />
      ) : (
        <Path key={p.key} {...p.config} listening={listening} />
      ),
    )
  }, [nodes, listening])
}
