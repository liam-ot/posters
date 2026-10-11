import type { PuppetAsset } from '../puppet/types'
import { useUI } from '../store/ui'
import { useStudio } from './store'

/** Open a character in the puppet studio with a fresh undo history. */
export function openCharacter(asset: PuppetAsset, from: 'gallery' | 'editor') {
  useStudio.getState().load(asset)
  useStudio.temporal.getState().clear()
  useUI.getState().openStudio(from)
}
