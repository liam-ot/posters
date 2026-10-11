import { buildMesh } from '../puppet/build'
import type { PuppetAsset } from '../puppet/types'
import { useStudio } from './store'

/** Build (or rebuild) the open character's mesh at `detail`; one undo step unless `silent`. */
export function rebuildMesh(asset: PuppetAsset, detail = asset.puppet.detail, silent = false) {
  const t0 = performance.now()
  const mesh = buildMesh({ ...asset, puppet: { ...asset.puppet, detail } })
  const ms = Math.round(performance.now() - t0)
  const apply = (d: PuppetAsset) => {
    d.puppet.detail = detail
    d.puppet.mesh = mesh
  }
  const s = useStudio.getState()
  if (silent) s.silently(apply)
  else s.edit(apply)
  useStudio.setState({ meshMs: ms })
}
