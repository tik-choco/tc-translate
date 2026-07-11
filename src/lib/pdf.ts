export const maxPdfPages = 20

const pdfRenderScale = 2

export type PdfPageRender = {
  pageNumber: number
  pageCount: number
  dataUrl: string
}

// Renders each page of a PDF file to a PNG data URL, one page at a time, so
// each page can be fed through the existing image OCR pipeline. pdfjs-dist
// is dynamically imported so its ~1MB parser/worker is only downloaded when
// a PDF is actually dropped, not on every page load. The document and each
// page proxy are released as soon as they're no longer needed so decoded
// image data never outlives the page it came from.
export async function* renderPdfPages(file: File, maxPages: number = maxPdfPages): AsyncGenerator<PdfPageRender> {
  const [pdfjsLib, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buffer })
  const pdf = await loadingTask.promise

  try {
    if (pdf.numPages > maxPages) {
      throw new Error(`This PDF has ${pdf.numPages} pages, which exceeds the ${maxPages}-page limit.`)
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      try {
        const viewport = page.getViewport({ scale: pdfRenderScale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Could not create a canvas context to render the PDF.')
        }

        await page.render({ canvas, canvasContext: context, viewport }).promise
        const dataUrl = canvas.toDataURL('image/png')
        canvas.width = 0
        canvas.height = 0
        yield { pageNumber, pageCount: pdf.numPages, dataUrl }
      } finally {
        page.cleanup()
      }
    }
  } finally {
    await loadingTask.destroy()
  }
}
