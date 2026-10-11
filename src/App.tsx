import { useEffect } from 'react'
import { Editor } from './ui/Editor'
import { Gallery } from './ui/Gallery'
import { Studio } from './studio/Studio'
import { useUI } from './store/ui'
import { useFonts } from './store/fonts'
import { preloadStandardFonts } from './fonts/standard'

export default function App() {
  const view = useUI((s) => s.view)
  const loadCustom = useFonts((s) => s.loadCustom)
  const bumpVersion = useFonts((s) => s.bumpVersion)

  // Preload bundled fonts + persisted custom fonts, then redraw the canvas.
  useEffect(() => {
    preloadStandardFonts().then(() => bumpVersion())
    loadCustom()
  }, [loadCustom, bumpVersion])

  if (view === 'editor') return <Editor />
  if (view === 'studio') return <Studio />
  return <Gallery />
}
