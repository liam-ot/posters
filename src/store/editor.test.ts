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

describe('removeAnimation', () => {
  it('removes just that animation and keeps the layer (one undo step)', () => {
    useEditor.getState().loadDoc(createDefaultDoc('D'))
    const id = useEditor.getState().addLayer('rect')!
    const anim = (a: string) => ({ id: a, preset: 'pulse' as const, phase: 'loop' as const, enabled: true, easing: 'linear' as const, params: {} })
    useEditor.getState().updateLayer(id, { animations: [anim('a'), anim('b')] })
    const steps = useEditor.temporal.getState().pastStates.length
    useEditor.getState().removeAnimation(id, 'a')
    const layer = useEditor.getState().doc!.layers.find((l) => l.id === id)
    expect(layer).toBeDefined()
    expect(layer!.animations!.map((a) => a.id)).toEqual(['b'])
    expect(useEditor.temporal.getState().pastStates.length).toBe(steps + 1)
  })
})
