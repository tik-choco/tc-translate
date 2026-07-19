import type { ImageInput } from '../types'

export function createId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/**
 * Joins consecutive transcription segments as flowing text (no newline).
 * CJK boundaries concatenate directly; a space keeps Latin words apart.
 */
export function appendTranscript(base: string, text: string): string {
  const trimmed = base.trim()
  if (!trimmed) return text
  const cjkBoundary = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff9f]$/.test(trimmed) || /^[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff9f]/.test(text)
  return cjkBoundary ? trimmed + text : `${trimmed} ${text}`
}

export function readImageFile(file: File): Promise<ImageInput> {
  const maxImageBytes = 10 * 1024 * 1024
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Please choose an image file.'))
  }
  if (file.size > maxImageBytes) {
    return Promise.reject(new Error('Image must be 10 MB or smaller.'))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the image file.'))
        return
      }
      resolve({
        name: file.name || 'image',
        dataUrl: reader.result,
        size: file.size,
      })
    }
    reader.readAsDataURL(file)
  })
}

export function getFirstImageFile(files: FileList | null | undefined): File | null {
  for (const file of Array.from(files ?? [])) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}

export function getFirstAudioFile(files: FileList | null | undefined): File | null {
  for (const file of Array.from(files ?? [])) {
    if (file.type.startsWith('audio/')) return file
  }
  return null
}

export function getFirstPdfFile(files: FileList | null | undefined): File | null {
  for (const file of Array.from(files ?? [])) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return file
  }
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.inset = '0 auto auto -9999px'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    const copied = document.execCommand('copy')
    if (!copied) throw new Error('Copy command failed.')
  } finally {
    document.body.removeChild(textarea)
  }
}
