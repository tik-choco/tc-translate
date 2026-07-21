import { useMemo, useRef, useState } from 'preact/hooks'
import { normalizeBaseUrl, writeClipboard } from '../../lib/format'
import { localizeNetworkError } from '../../lib/network'
import { translateIncomingMessage, translateReply, type ReplyTranslateResult } from '../../lib/replyTranslate'
import { loadReplyAutoCopy, saveReplyAutoCopy } from '../../lib/storage'
import type { ProviderSettings, ReplyResult, Status } from '../../types'

type UseReplyTranslateParams = {
  settings: ProviderSettings
  nativeLanguage: string
  onDone?: (partnerMessage: string, result: ReplyResult) => void
}

// How long the "copied" checkmark stays on the copy button after a manual or
// automatic copy, mirroring copiedTone's window in useTranslationActions.ts.
const copiedResetDelay = 1500

export function useReplyTranslate({ settings, nativeLanguage, onDone }: UseReplyTranslateParams) {
  const [partnerMessage, setPartnerMessageState] = useState('')
  const [ownReply, setOwnReply] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<ReplyTranslateResult | null>(null)
  const [error, setError] = useState('')
  const [autoCopy, setAutoCopyState] = useState(() => loadReplyAutoCopy())
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<number | undefined>(undefined)

  const [incomingStatus, setIncomingStatus] = useState<Status>('idle')
  const [incomingTranslation, setIncomingTranslation] = useState('')
  const [incomingError, setIncomingError] = useState('')

  const generation = useRef(0)
  const incomingGeneration = useRef(0)

  const providerConfigured = Boolean(
    settings.connection === 'network' ? settings.roomId.trim() : settings.model.trim() && normalizeBaseUrl(settings.baseUrl),
  )

  const canTranslate = useMemo(
    () => Boolean(partnerMessage.trim() && ownReply.trim() && providerConfigured),
    [partnerMessage, ownReply, providerConfigured],
  )

  function setAutoCopy(value: boolean): void {
    setAutoCopyState(value)
    saveReplyAutoCopy(value)
  }

  // Best-effort: a failed clipboard write (permission denied, insecure
  // context) shouldn't surface as an error - the translated text is still
  // visible in the result card for the user to copy manually.
  async function copyResult(text: string): Promise<void> {
    try {
      await writeClipboard(text)
    } catch {
      return
    }
    setCopied(true)
    window.clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), copiedResetDelay)
  }

  // Edits to partnerMessage invalidate any translation of the previous text,
  // so it doesn't keep showing a stale translation of what used to be there.
  function setPartnerMessage(value: string): void {
    setPartnerMessageState(value)
    incomingGeneration.current += 1
    setIncomingStatus('idle')
    setIncomingTranslation('')
    setIncomingError('')
  }

  async function handleTranslate(): Promise<void> {
    if (!canTranslate || status === 'loading') return

    const currentGeneration = ++generation.current
    setStatus('loading')
    setError('')

    try {
      const nextResult = await translateReply({ settings, partnerMessage, ownReply, nativeLanguage })
      if (generation.current !== currentGeneration) return
      setResult(nextResult)
      setStatus('done')
      if (autoCopy) void copyResult(nextResult.translatedReply)
      onDone?.(partnerMessage, {
        ownReply,
        detectedLanguage: nextResult.detectedLanguage,
        translatedReply: nextResult.translatedReply,
      })
    } catch (err) {
      if (generation.current !== currentGeneration) return
      setError(localizeNetworkError(err, 'Reply translation failed.'))
      setStatus('error')
    }
  }

  // Translates text that was just pasted, before the partnerMessage state
  // update from setPartnerMessage has propagated - takes the text explicitly
  // rather than reading the closed-over state.
  async function runIncomingTranslation(text: string): Promise<void> {
    const currentGeneration = ++incomingGeneration.current
    setIncomingStatus('loading')
    setIncomingError('')

    try {
      const translation = await translateIncomingMessage({ settings, partnerMessage: text, nativeLanguage })
      if (incomingGeneration.current !== currentGeneration) return
      setIncomingTranslation(translation)
      setIncomingStatus('done')
    } catch (err) {
      if (incomingGeneration.current !== currentGeneration) return
      setIncomingError(localizeNetworkError(err, 'Translation failed.'))
      setIncomingStatus('error')
    }
  }

  // Always reads the clipboard fresh and replaces partnerMessage with it,
  // then translates that pasted text into nativeLanguage - pressing this
  // again after copying a new message overwrites the old one rather than
  // re-translating stale text.
  async function handlePasteAndTranslateIncoming(): Promise<void> {
    if (incomingStatus === 'loading' || !providerConfigured) return

    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      // Clipboard read unavailable or denied; nothing to paste.
      return
    }
    if (!text.trim()) return

    setPartnerMessage(text)
    await runIncomingTranslation(text)
  }

  function reset(): void {
    generation.current += 1
    incomingGeneration.current += 1
    window.clearTimeout(copiedTimeoutRef.current)
    setPartnerMessageState('')
    setOwnReply('')
    setStatus('idle')
    setResult(null)
    setError('')
    setCopied(false)
    setIncomingStatus('idle')
    setIncomingTranslation('')
    setIncomingError('')
  }

  return {
    partnerMessage,
    setPartnerMessage,
    ownReply,
    setOwnReply,
    status,
    result,
    error,
    canTranslate,
    providerConfigured,
    handleTranslate,
    autoCopy,
    setAutoCopy,
    copied,
    copyResult,
    incomingStatus,
    incomingTranslation,
    incomingError,
    handlePasteAndTranslateIncoming,
    reset,
  }
}
