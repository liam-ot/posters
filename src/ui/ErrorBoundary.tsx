import { Component, type ReactNode } from 'react'

/**
 * Catches a crash in a view and shows what happened with a way out, instead of a
 * blank screen. Your work is safe: posters autosave, and the last save is on disk.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void; resetKey: string },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    // Switching views (e.g. back to the gallery) gives the new view a clean start.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-[28rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-2xl">
          <h1 className="mb-1 text-sm font-semibold text-[var(--color-text)]">Something went wrong</h1>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            The last autosave is safe on disk. Go back to the gallery and open the poster again, or reload the page.
          </p>
          <pre className="mb-4 max-h-32 overflow-auto rounded-md bg-[var(--color-panel-2)] p-2 text-[11px] text-amber-300">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={this.props.onBack}
              className="flex-1 rounded-lg bg-[var(--color-accent)] py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Back to gallery
            </button>
            <button
              onClick={() => location.reload()}
              className="flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
