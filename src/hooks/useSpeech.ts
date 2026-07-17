import { useEffect, useRef, useState } from 'preact/hooks'
import { localizeNetworkError, requestNetworkTts } from '../lib/network'
import { resolveTtsConnection, synthesizeSpeech } from '../lib/voice'
import type { SharedLlmConfigV1 } from '../lib/llmConfig'
import type { TtsSettings } from '../types'

type UseSpeechParams = {
  ttsSettings: TtsSettings
  llmConfig: SharedLlmConfigV1
  roomId: string
}

export function useSpeech({ ttsSettings, llmConfig, roomId }: UseSpeechParams) {
  const browserSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const connection = resolveTtsConnection(llmConfig)
  const apiConfigured = Boolean(connection.baseUrl && ttsSettings.model.trim())
  const roomConfigured = Boolean(roomId.trim())
  const useNetworkEngine = ttsSettings.engine === 'network' && roomConfigured
  const useApiEngine = ttsSettings.engine === 'api' && apiConfigured
  const supported = browserSupported || apiConfigured || useNetworkEngine
  const downloadSupported = useNetworkEngine || useApiEngine

  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [speechError, setSpeechError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const blobCacheRef = useRef<{ id: string; text: string; blob: Blob } | null>(null)
  // Bumped on every stop()/speak() so a slow (network) getBlob() that resolves
  // after the user moved on can't resurrect playback they already dismissed.
  const playGenerationRef = useRef(0)
  // Bumped on every downloadAudio() call so a slow fetch superseded by a
  // newer download request can't trigger a stale download.
  const downloadGenerationRef = useRef(0)

  useEffect(() => {
    return () => {
      if (browserSupported) window.speechSynthesis.cancel()
      audioRef.current?.pause()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [browserSupported])

  function stop(): void {
    playGenerationRef.current += 1
    if (browserSupported) window.speechSynthesis.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setSpeakingId(null)
    setLoadingId(null)
  }

  function speakWithBrowser(text: string, lang: string | undefined, id: string): void {
    if (!browserSupported) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    if (lang) utterance.lang = lang
    utterance.onend = () => setSpeakingId((current) => (current === id ? null : current))
    utterance.onerror = () => setSpeakingId((current) => (current === id ? null : current))
    window.speechSynthesis.speak(utterance)
    setSpeakingId(id)
  }

  async function playFromSource(
    getBlob: () => Promise<Blob>,
    text: string,
    lang: string | undefined,
    id: string,
  ): Promise<void> {
    const generation = playGenerationRef.current
    setSpeechError('')
    setLoadingId(id)

    try {
      const blob = await getBlob()
      if (generation !== playGenerationRef.current) return // superseded by stop()/another speak()
      blobCacheRef.current = { id, text, blob }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url

      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setSpeakingId((current) => (current === id ? null : current))
      audio.onerror = () => setSpeakingId((current) => (current === id ? null : current))

      setLoadingId(null)
      setSpeakingId(id)
      await audio.play()
    } catch (apiError) {
      if (generation !== playGenerationRef.current) return // superseded; don't resurrect error/fallback
      setLoadingId(null)
      if (browserSupported) {
        setSpeechError('API/Network TTS failed. Falling back to the browser voice.')
        speakWithBrowser(text, lang, id)
        return
      }
      setSpeechError(localizeNetworkError(apiError, 'Speech playback failed.'))
      setSpeakingId(null)
    }
  }

  function speak(text: string, lang: string | undefined, id: string): void {
    if (!supported || !text.trim()) return

    if (speakingId === id || loadingId === id) {
      stop()
      return
    }

    stop()

    if (useNetworkEngine) {
      void playFromSource(
        () => requestNetworkTts(roomId, { text, model: ttsSettings.model, voice: ttsSettings.voice }),
        text,
        lang,
        id,
      )
      return
    }

    if (useApiEngine) {
      void playFromSource(
        () => synthesizeSpeech({ connection, model: ttsSettings.model, voice: ttsSettings.voice, text }),
        text,
        lang,
        id,
      )
      return
    }

    speakWithBrowser(text, lang, id)
  }

  function extensionForBlob(blob: Blob): string {
    switch (blob.type) {
      case 'audio/mpeg':
      case 'audio/mp3':
        return 'mp3'
      case 'audio/wav':
      case 'audio/x-wav':
        return 'wav'
      case 'audio/ogg':
        return 'ogg'
      case 'audio/aac':
        return 'aac'
      case 'audio/flac':
        return 'flac'
      case 'audio/webm':
        return 'webm'
      default:
        return 'mp3'
    }
  }

  const invalidFilenameChars = '\\/:*?"<>|'

  function slugForText(text: string): string {
    const chars = text.trim().slice(0, 24).split('')
    const sanitized = chars
      .map((ch) => {
        const code = ch.charCodeAt(0)
        if (code <= 31) return '_'
        if (invalidFilenameChars.indexOf(ch) !== -1) return '_'
        if (/\s/.test(ch)) return '_'
        return ch
      })
      .join('')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
    return sanitized
  }

  function triggerDownload(blob: Blob, text: string): void {
    const extension = extensionForBlob(blob)
    const slug = slugForText(text)
    const filename = (slug ? `tts-${slug}` : 'tts-audio') + `.${extension}`
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function downloadAudio(text: string, id: string): void {
    if (!downloadSupported || !text.trim()) return
    if (downloadingId === id) return

    const generation = ++downloadGenerationRef.current

    const getBlob = useNetworkEngine
      ? () => requestNetworkTts(roomId, { text, model: ttsSettings.model, voice: ttsSettings.voice })
      : () => synthesizeSpeech({ connection, model: ttsSettings.model, voice: ttsSettings.voice, text })

    setSpeechError('')
    setDownloadingId(id)

    void (async () => {
      try {
        const cached = blobCacheRef.current
        let blob: Blob
        if (cached && cached.id === id && cached.text === text) {
          blob = cached.blob
        } else {
          blob = await getBlob()
          if (generation !== downloadGenerationRef.current) return // superseded by a newer download call
          blobCacheRef.current = { id, text, blob }
        }
        // Some providers ignore `response_format: 'mp3'` and return WAV;
        // normalize to MP3 in the browser (lazy chunk) before saving.
        const { ensureMp3Blob } = await import('../lib/audioConvert')
        const mp3Blob = await ensureMp3Blob(blob)
        if (generation !== downloadGenerationRef.current) return // superseded during conversion
        setDownloadingId(null)
        triggerDownload(mp3Blob, text)
      } catch (err) {
        if (generation !== downloadGenerationRef.current) return // superseded; don't resurrect error
        setDownloadingId(null)
        setSpeechError(localizeNetworkError(err, 'Speech download failed.'))
      }
    })()
  }

  return {
    supported,
    speakingId,
    loadingId,
    speechError,
    speak,
    stop,
    downloadSupported,
    downloadingId,
    downloadAudio,
  }
}
