import { useEffect, useState } from 'react'

/** Loads a src (data URL or path) into an HTMLImageElement for Konva. */
export function useImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined)

  useEffect(() => {
    if (!src) {
      setImage(undefined)
      return
    }
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    const onLoad = () => setImage(img)
    img.addEventListener('load', onLoad)
    img.src = src
    return () => img.removeEventListener('load', onLoad)
  }, [src])

  return image
}
