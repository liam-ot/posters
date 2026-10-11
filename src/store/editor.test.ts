import { describe, expect, it } from 'vitest'
import { useEditor } from './editor'
import { createDefaultDoc } from '../lib/layers'

describe('editor undo history', () => {
  it('starts fresh for every opened poster', () => {
    const s = useEditor.getState()
    s.loadDoc(createDefaultDoc('A'))
    useEditor.getState().addLayer('rect')
    useEditor.getState().addLayer('ellipse')
    expect(useEditor.temporal.getState().pastStates.length).toBe(2)

    useEditor.getState().loadDoc(createDefaultDoc('B'))
    expect(useEditor.temporal.getState().pastStates.length).toBe(0)
    useEditor.temporal.getState().undo()
    expect(useEditor.getState().doc?.name).toBe('B')
  })

  it('does not record selection-only changes', () => {
    useEditor.getState().loadDoc(createDefaultDoc('C'))
    const id = useEditor.getState().addLayer('rect')!
    const steps = useEditor.temporal.getState().pastStates.length
    useEditor.getState().setSelection([])
    useEditor.getState().setSelection([id])
    expect(useEditor.temporal.getState().pastStates.length).toBe(steps)
  })
})
