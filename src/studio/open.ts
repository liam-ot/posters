import type { PuppetAsset } from '../puppet/types'
import { useUI } from '../store/ui'
import { useStudio } from './store'
import { useTimeline } from '../store/timeline'

/** Open a character in the puppet studio with a fresh undo history. */
export function openCharacter(asset: PuppetAsset, from: 'gallery' | 'editor') {
  // Start paused at the beginning: that's where poses are edited.
  useTimeline.setState({ playing: false, time: 0 })
  useStudio.getState().load(asset)
  useStudio.temporal.getState().clear()
  useUI.getState().openStudio(from)
}
