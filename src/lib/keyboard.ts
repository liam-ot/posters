/**
 * Is keyboard focus in a control that uses typing or arrow keys itself (text
 * fields, sliders)? Global shortcuts skip these so e.g. arrows on a focused
 * slider don't also nudge the selected layer.
 */
export function isTyping() {
  const el = document.activeElement as HTMLElement | null
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el?.isContentEditable === true ||
    el?.getAttribute('role') === 'slider'
  )
}
