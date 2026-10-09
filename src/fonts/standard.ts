// Self-hosted standard fonts (bundled by Vite, fully offline).
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/archivo'
import '@fontsource-variable/montserrat'
import '@fontsource-variable/syne'
import '@fontsource-variable/oswald'
import '@fontsource-variable/playfair-display'
import '@fontsource/bebas-neue'
import '@fontsource/anton'

export interface StandardFont {
  label: string
  family: string
  category: 'Sans' | 'Display' | 'Serif' | 'System'
}

export const STANDARD_FONTS: StandardFont[] = [
  { label: 'Inter', family: 'Inter Variable', category: 'Sans' },
  { label: 'Space Grotesk', family: 'Space Grotesk Variable', category: 'Sans' },
  { label: 'DM Sans', family: 'DM Sans Variable', category: 'Sans' },
  { label: 'Archivo', family: 'Archivo Variable', category: 'Sans' },
  { label: 'Montserrat', family: 'Montserrat Variable', category: 'Sans' },
  { label: 'Oswald', family: 'Oswald Variable', category: 'Display' },
  { label: 'Syne', family: 'Syne Variable', category: 'Display' },
  { label: 'Bebas Neue', family: 'Bebas Neue', category: 'Display' },
  { label: 'Anton', family: 'Anton', category: 'Display' },
  { label: 'Playfair Display', family: 'Playfair Display Variable', category: 'Serif' },
  { label: 'System Sans', family: 'system-ui, sans-serif', category: 'System' },
  { label: 'Georgia', family: 'Georgia, serif', category: 'System' },
  { label: 'Courier', family: '"Courier New", monospace', category: 'System' },
]

/**
 * @font-face fonts load lazily (only when used by the DOM), and Konva's canvas
 * text doesn't reliably trigger that. Explicitly fetch the bundled families so
 * they're ready before the canvas measures/draws text.
 */
export async function preloadStandardFonts(): Promise<void> {
  await Promise.all(
    STANDARD_FONTS.filter((f) => f.category !== 'System').map((f) =>
      document.fonts.load(`1em "${f.family}"`).catch(() => {}),
    ),
  )
}
