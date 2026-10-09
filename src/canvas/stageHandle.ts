import type Konva from 'konva'

// Singleton handle to the live Konva stage.
let _stage: Konva.Stage | null = null

export function setStage(s: Konva.Stage | null) {
  _stage = s
}
export function getStage(): Konva.Stage | null {
  return _stage
}
