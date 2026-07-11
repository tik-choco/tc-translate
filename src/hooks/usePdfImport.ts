import { useState } from 'preact/hooks'
import { readImageText } from '../lib/api'
import { renderPdfPages } from '../lib/pdf'
import type { ProviderSettings } from '../types'

type UsePdfImportParams = {
  settings: ProviderSettings
  sourceText: string
  setSourceText: (value: string) => void
}

export type PdfPageProgress = {
  current: number
  total: number
}

export function usePdfImport({ settings, sourceText, setSourceText }: UsePdfImportParams) {
  const [isImportingPdf, setIsImportingPdf] = useState(false)
  const [pdfImportError, setPdfImportError] = useState('')
  const [pdfPageProgress, setPdfPageProgress] = useState<PdfPageProgress | null>(null)

  async function importPdfFile(file: File): Promise<void> {
    if (isImportingPdf) return

    setPdfImportError('')
    setIsImportingPdf(true)
    setPdfPageProgress(null)

    const prefix = sourceText.trim() ? `${sourceText.trim()}\n` : ''

    try {
      const pageTexts: string[] = []
      let lastPageError: unknown = null

      for await (const { pageNumber, pageCount, dataUrl } of renderPdfPages(file)) {
        setPdfPageProgress({ current: pageNumber, total: pageCount })
        const priorText = pageTexts.join('\n\n')
        let streamed = ''
        try {
          const text = await readImageText({
            settings,
            image: {
              name: `${file.name || 'document.pdf'} (page ${pageNumber})`,
              dataUrl,
              size: Math.round((dataUrl.length * 3) / 4),
            },
            onDelta: (delta) => {
              streamed += delta
              setSourceText(prefix + [priorText, streamed].filter(Boolean).join('\n\n'))
            },
          })
          if (text.trim()) pageTexts.push(text.trim())
        } catch (pageError) {
          // A page with no readable text (or a transient OCR failure) shouldn't
          // abort the whole document; only surface an error if every page fails.
          lastPageError = pageError
        }
      }

      if (!pageTexts.length) {
        throw lastPageError instanceof Error ? lastPageError : new Error('No readable text was found in the PDF.')
      }

      setSourceText(prefix + pageTexts.join('\n\n'))
    } catch (pdfError) {
      setPdfImportError(pdfError instanceof Error ? pdfError.message : 'Could not process the PDF file.')
    } finally {
      setIsImportingPdf(false)
      setPdfPageProgress(null)
    }
  }

  return { isImportingPdf, pdfImportError, pdfPageProgress, importPdfFile }
}
