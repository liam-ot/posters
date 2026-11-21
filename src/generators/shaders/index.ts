import type { GeneratorKind } from '../../types/poster'
import type { ShaderGenerator } from './common'
import { shaderTest } from './test'
import { clouds } from './clouds'
import { aura } from './aura'

export type { ShaderGenerator } from './common'

export const SHADERS: Partial<Record<GeneratorKind, ShaderGenerator>> = {
  gltest: shaderTest,
  clouds,
  aura,
}
