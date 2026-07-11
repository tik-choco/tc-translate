import { useState } from 'preact/hooks'
import { readImageText } from '../lib/api'
import { readImageFile } from '../lib/format'
import type { ImageInput, ProviderSettings } from '../types'

type UseImageImportParams = {
  settings: ProviderSettings
  sourceText: string
  setSourceText: (value: string) => void
}

export function useImageImport({ settings, sourceText, setSourceText }: UseImageImportParams) {
  const [imageInput, setImageInput] = useState<ImageInput | null>(null)
  const [isReadingImage, setIsReadingImage] = useState(false)
  const [imageImportError, setImageImportError] = useState('')

  async function handleImageFile(file: File | null | undefined): Promise<void> {
    if (!file || isReadingImage) return

    setImageImportError('')

    try {
      const nextImage = await readImageFile(file)
      setImageInput(nextImage)
      setIsReadingImage(true)

      const prefix = sourceText.trim() ? `${sourceText.trim()}\n` : ''
      let streamed = ''
      const text = await readImageText({
        settings,
        image: nextImage,
        onDelta: (delta) => {
          streamed += delta
          setSourceText(prefix + streamed)
        },
      })
      setSourceText(prefix + text)
      setImageInput(null)
    } catch (imageError) {
      setImageImportError(imageError instanceof Error ? imageError.message : 'Could not read the image.')
    } finally {
      setIsReadingImage(false)
    }
  }

  function clearImageInput(): void {
    setImageInput(null)
  }

  return { imageInput, isReadingImage, imageImportError, handleImageFile, clearImageInput }
}
