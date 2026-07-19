import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'
import { maxRecordingDurationMs } from '../constants'
import { localizeNetworkError, requestNetworkStt } from '../lib/network'
import { resolveSttConnection, transcribeAudio } from '../lib/voice'
import type { SharedLlmConfigV1 } from '../lib/llmConfig'
import type { SttSettings } from '../types'

type UseTranscriptionParams = {
  sttSettings: SttSettings
  llmConfig: SharedLlmConfigV1
  roomId: string
  /** BCP-47 code for the browser fallback recognizer (e.g. 'ja-JP'). */
  speechLang?: string
  onTranscribed: (text: string) => void
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

export function useTranscription({ sttSettings, llmConfig, roomId, speechLang, onTranscribed }: UseTranscriptionParams) {
  const connection = resolveSttConnection(llmConfig)
  const useBrowser = sttSettings.engine === 'browser'
  const apiConfigured = !useBrowser && Boolean(connection.baseUrl && sttSettings.model.trim())
  const useNetwork = sttSettings.engine === 'network'
  const roomConfigured = Boolean(roomId.trim())
  const networkConfigured = useNetwork && roomConfigured
  const modelConfigured = apiConfigured || networkConfigured
  const recorderSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  const browserRecognitionSupported = Boolean(getSpeechRecognitionConstructor())
  // Explicitly choosing the browser engine always uses the Web Speech API.
  // With no STT model configured otherwise, fall back to it too so the mic
  // still works — and transcribes live to boot.
  const browserFallback = useBrowser ? browserRecognitionSupported : !modelConfigured && browserRecognitionSupported
  const supported = modelConfigured ? recorderSupported : browserFallback

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const sessionFinalRef = useRef('')
  const listeningRef = useRef(false)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopStream(): void {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function clearMaxDurationTimer(): void {
    if (maxDurationTimerRef.current === null) return
    clearTimeout(maxDurationTimerRef.current)
    maxDurationTimerRef.current = null
  }

  function scheduleMaxDurationStop(): void {
    clearMaxDurationTimer()
    maxDurationTimerRef.current = setTimeout(() => stopRecording(), maxRecordingDurationMs)
  }

  async function runTranscription(audio: Blob, fileName: string): Promise<void> {
    if (!audio.size) return

    setIsTranscribing(true)
    try {
      const text = networkConfigured
        ? await requestNetworkStt(roomId, { audio, model: sttSettings.model, fileName })
        : await transcribeAudio({
            connection,
            model: sttSettings.model,
            audio,
            fileName,
          })
      onTranscribed(text.trim())
    } catch (transcribeError) {
      setTranscriptionError(localizeNetworkError(transcribeError, t('stt-transcription-failed')))
    } finally {
      setIsTranscribing(false)
    }
  }

  async function handleRecordingStop(): Promise<void> {
    setIsRecording(false)
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    chunksRef.current = []
    stopStream()

    await runTranscription(blob, `recording.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`)
  }

  async function transcribeFile(file: File): Promise<void> {
    if (isRecording || isTranscribing) return

    setTranscriptionError('')

    if (useBrowser) {
      setTranscriptionError(t('stt-browser-file-unsupported'))
      return
    }

    if (!modelConfigured) {
      setTranscriptionError(t('stt-not-configured'))
      return
    }

    await runTranscription(file, file.name || 'audio')
  }

  function startBrowserRecognition(): void {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    if (speechLang) recognition.lang = speechLang

    sessionFinalRef.current = ''
    listeningRef.current = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) sessionFinalRef.current += result[0].transcript
        else interim += result[0].transcript
      }
      setLiveTranscript(sessionFinalRef.current + interim)
    }

    recognition.onerror = (event) => {
      // 'no-speech' just means a silent stretch; the onend restart handles it.
      if (event.error === 'no-speech') return
      listeningRef.current = false
      // Web Speech API error codes are raw English identifiers ('network',
      // 'not-allowed', …) — never show them to the user as-is. 'network' in
      // particular means the browser's own cloud recognizer is unreachable,
      // not anything about the app's configured STT provider.
      const message =
        event.error === 'network'
          ? t('stt-browser-network-error')
          : event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? t('stt-mic-denied')
            : event.error
              ? `${t('stt-recognition-error')} (${event.error})`
              : t('stt-recognition-error')
      // If we got here via the silent no-model fallback (engine is api/network
      // but unresolved), say so — otherwise the user thinks their configured
      // STT failed when it was never used.
      setTranscriptionError(useBrowser ? message : `${message} ${t('stt-fallback-hint')}`)
    }

    recognition.onend = () => {
      // Chrome ends sessions after silence; keep going until the user stops.
      if (listeningRef.current) {
        recognition.start()
        return
      }
      recognitionRef.current = null
      const text = sessionFinalRef.current.trim()
      sessionFinalRef.current = ''
      setLiveTranscript('')
      setIsRecording(false)
      if (text) onTranscribed(text)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
    scheduleMaxDurationStop()
  }

  async function startRecording(): Promise<void> {
    if (!supported || isRecording) return

    setTranscriptionError('')

    if (!modelConfigured) {
      startBrowserRecognition()
      return
    }

    try {
      // Plain (non-exact) deviceId keeps this working when the chosen mic is
      // unplugged: the browser falls back to the default input instead of
      // throwing OverconstrainedError.
      const micDeviceId = sttSettings.micDeviceId.trim()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: micDeviceId } : true,
      })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => void handleRecordingStop()
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      scheduleMaxDurationStop()
    } catch (permissionError) {
      setTranscriptionError(
        permissionError instanceof Error ? permissionError.message : t('stt-mic-denied'),
      )
      stopStream()
    }
  }

  function stopRecording(): void {
    clearMaxDurationTimer()
    if (recognitionRef.current) {
      listeningRef.current = false
      recognitionRef.current.stop()
      return
    }
    mediaRecorderRef.current?.stop()
  }

  function toggleRecording(): void {
    if (isRecording) {
      stopRecording()
      return
    }
    void startRecording()
  }

  useEffect(() => {
    return () => {
      clearMaxDurationTimer()
      listeningRef.current = false
      recognitionRef.current?.stop()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      stopStream()
    }
  }, [])

  return { supported, isRecording, isTranscribing, transcriptionError, liveTranscript, toggleRecording, transcribeFile }
}
