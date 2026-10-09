export interface ArtboardPreset {
  label: string
  width: number
  height: number
}

export const ARTBOARD_PRESETS: ArtboardPreset[] = [
  { label: 'Event poster (1080×1320)', width: 1080, height: 1320 },
  { label: 'Instagram square (1080×1080)', width: 1080, height: 1080 },
  { label: 'Instagram portrait (1080×1350)', width: 1080, height: 1350 },
  { label: 'Story / Reel (1080×1920)', width: 1080, height: 1920 },
  { label: 'A3 print @150dpi (1754×2480)', width: 1754, height: 2480 },
]
