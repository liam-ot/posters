import type { EasingName } from '../types/poster'

const C1 = 1.70158
const C3 = C1 + 1

function bounceOut(t: number) {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}

/** All easings map 0→0 and 1→1; back/elastic overshoot in between. */
export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  backOut: (t) => 1 + C3 * Math.pow(t - 1, 3) + C1 * Math.pow(t - 1, 2),
  elasticOut: (t) =>
    t === 0 || t === 1
      ? t
      : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1,
  bounceOut,
}

export const EASING_OPTIONS: { value: EasingName; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeIn', label: 'Ease in' },
  { value: 'easeOut', label: 'Ease out' },
  { value: 'easeInOut', label: 'Ease in-out' },
  { value: 'backOut', label: 'Back (overshoot)' },
  { value: 'elasticOut', label: 'Elastic' },
  { value: 'bounceOut', label: 'Bounce' },
]

export function ease(name: EasingName, t: number): number {
  return EASINGS[name](Math.min(1, Math.max(0, t)))
}
