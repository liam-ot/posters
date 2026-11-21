import { Component, type ReactNode } from 'react'

/**
 * Wraps one layer on the canvas. The canvas is its own React root (react-konva),
 * so a crash in one layer would otherwise blank the whole canvas while the rest
 * of the app keeps running. Here a broken layer is skipped and reported instead.
 */
export class LayerBoundary extends Component<
  {
    children: ReactNode
    layerId: string
    /** When this changes (an edit, an undo), a failed layer gets another try. */
    resetOn: unknown
    onError: (layerId: string, error: Error | null) => void
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error(`Layer ${this.props.layerId} couldn't be drawn`, error)
    this.props.onError(this.props.layerId, error)
  }

  componentDidUpdate(prev: { resetOn: unknown }) {
    if (this.state.failed && prev.resetOn !== this.props.resetOn) {
      this.setState({ failed: false })
      this.props.onError(this.props.layerId, null)
    }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
