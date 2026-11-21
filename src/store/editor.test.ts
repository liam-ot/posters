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

describe('multi-layer duplicate, copy/paste and move', () => {
  const setup = () => {
    useEditor.getState().loadDoc(createDefaultDoc('M'))
    const a = useEditor.getState().addLayer('rect')!
    const b = useEditor.getState().addLayer('ellipse')!
    const c = useEditor.getState().addLayer('rect')!
    useEditor.getState().setSelection([a, c])
    return { a, b, c }
  }
  const ids = () => useEditor.getState().doc!.layers.map((l) => l.id)
  const layer = (id: string) => useEditor.getState().doc!.layers.find((l) => l.id === id)!

  it('⌘D copies every selected layer above its own, in one undo step', () => {
    const { a, b, c } = setup()
    const steps = useEditor.temporal.getState().pastStates.length
    useEditor.getState().duplicateLayers([a, c])
    const [ca, cc] = useEditor.getState().selectedIds
    expect(ids()).toEqual([a, ca, b, c, cc])
    expect(layer(ca).x).toBe(layer(a).x + 24)
    expect(useEditor.temporal.getState().pastStates.length).toBe(steps + 1)
  })

  it('Alt-drag copies stay in place below and the originals stay selected', () => {
    const { a, b, c } = setup()
    useEditor.getState().duplicateLayers([a, c], { inPlace: true })
    const all = ids()
    expect(all).toHaveLength(5)
    expect([all[1], all[2], all[4]]).toEqual([a, b, c])
    expect(layer(all[0]).x).toBe(layer(a).x)
    expect(useEditor.getState().selectedIds).toEqual([a, c])
  })

  it('pastes copies on top, stepping further each paste, and selects them', () => {
    const { a, b, c } = setup()
    useEditor.getState().copySelected()
    useEditor.getState().paste()
    useEditor.getState().paste()
    const all = ids()
    expect(all.slice(0, 3)).toEqual([a, b, c])
    expect(all).toHaveLength(7)
    expect(useEditor.getState().selectedIds).toEqual(all.slice(5))
    expect(layer(all[5]).x).toBe(layer(a).x + 48)
    expect(layer(all[6]).name).toBe(layer(c).name)
  })

  it('cut removes the layers and paste brings them back', () => {
    const { b } = setup()
    useEditor.getState().cutSelected()
    expect(ids()).toEqual([b])
    useEditor.getState().paste()
    expect(ids()).toHaveLength(3)
  })

  it('moves several layers in one undo step', () => {
    const { a, c } = setup()
    const steps = useEditor.temporal.getState().pastStates.length
    useEditor.getState().moveLayers({ [a]: { x: 1, y: 2 }, [c]: { x: 3, y: 4 } })
    expect([layer(a).x, layer(c).y]).toEqual([1, 4])
    expect(useEditor.temporal.getState().pastStates.length).toBe(steps + 1)
  })
})
