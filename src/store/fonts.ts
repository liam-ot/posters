import { create } from 'zustand'
import type { CustomFontMeta } from '../types/poster'

interface FontsState {
  custom: CustomFontMeta[]
  fontsVersion: number
  bumpVersion: () => void
  loadCustom: () => Promise<void>
  addCustomFromFile: (file: File) => Promise<CustomFontMeta | undefined>
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Register a font with the document so it's usable on the canvas. */
async function registerFontFace(
  family: string,
  source: ArrayBuffer | string,
) {
  const ff =
    typeof source === 'string'
      ? new FontFace(family, `url(${source})`)
      : new FontFace(family, source)
  await ff.load()
  document.fonts.add(ff)
}

function familyFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Custom Font'
}

export const useFonts = create<FontsState>((set, get) => ({
  custom: [],
  fontsVersion: 0,
  bumpVersion: () => set((s) => ({ fontsVersion: s.fontsVersion + 1 })),

  loadCustom: async () => {
    try {
      const res = await fetch('/api/fonts')
      if (!res.ok) return
      const list: CustomFontMeta[] = await res.json()
      await Promise.all(
        list.map((f) =>
          registerFontFace(f.family, `/api/fonts/file/${f.id}`).catch(() => {}),
        ),
      )
      set({ custom: list })
      get().bumpVersion()
    } catch {
      // file API unavailable — custom fonts simply won't be listed
    }
  },

  addCustomFromFile: async (file) => {
    const ext = (file.name.split('.').pop() || 'ttf').toLowerCase()
    const family = familyFromFileName(file.name)
    const buf = await file.arrayBuffer()

    // Register immediately so it's usable without a round-trip.
    await registerFontFace(family, buf.slice(0))

    // Persist to disk via the file API.
    let meta: CustomFontMeta | undefined
    try {
      const res = await fetch('/api/fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family,
          fileName: file.name,
          ext,
          dataBase64: arrayBufferToBase64(buf),
        }),
      })
      if (res.ok) meta = await res.json()
    } catch {
      // persistence failed; font still works for this session
    }

    if (!meta) {
      meta = { id: family, family, fileName: file.name, ext }
    }
    set((s) => ({
      custom: [...s.custom.filter((f) => f.family !== family), meta!],
    }))
    get().bumpVersion()
    return meta
  },
}))
