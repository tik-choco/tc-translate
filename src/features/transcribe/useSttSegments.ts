import { useEffect, useRef, useState } from 'preact/hooks'
import { sttSegmentIntervalMs } from '../../constants'
import { t } from '../../i18n'
import { localizeNetworkError, requestNetworkStt } from '../../lib/network'
import { startRealtimeStt, type RealtimeSttHandle } from '../../lib/realtimeStt'
import { resolveSttConnection, transcribeAudio } from '../../lib/voice'
import type { SharedLlmConfigV1 } from '../../lib/llmConfig'
import type { SttSettings } from '../../types'

// Configured-STT path for the Transcribe tab, tried in order:
// 1. Realtime: the OpenAI Realtime API transcription intent (WebSocket,
//    lib/realtimeStt.ts) - live deltas + server-VAD-finalized segments.
//    Direct API connections only.
// 2. Batch: if the realtime connect fails (server doesn't speak it), record
//    with MediaRecorder, close off a segment every sttSegmentIntervalMs, and
//    send each one to /audio/transcriptions (or Network STT) as one request.
// TranscribePanel falls back to the browser's Web Speech API when no STT is
// configured at all (or the STT engine is explicitly 'browser').
// OpenAI-compatible STT endpoints take ISO-639-1 codes, not BCP-47 tags.
function toSttLanguage(speechLang: string): string {
  const base = speechLang.trim().split('-')[0].toLowerCase()
  return base === 'fil' ? 'tl' : base
}

export function useSttSegments(params: {
  sttSettings: SttSettings
  llmConfig: SharedLlmConfigV1
  roomId: string
  /** BCP-47 tag from the language picker (e.g. 'ja', 'en-US'). */
  speechLang: string
  onSegment: (text: string) => void
}) {
  const { sttSettings, llmConfig, roomId, speechLang, onSegment } = params
  const connection = resolveSttConnection(llmConfig)
  const language = toSttLanguage(speechLang)
  const apiConfigured = sttSettings.engine === 'api' && Boolean(connection.baseUrl && sttSettings.model.trim())
  const networkConfigured = sttSettings.engine === 'network' && Boolean(roomId.trim())
  const recorderSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  const configured = (apiConfigured || networkConfigured) && recorderSupported

  const [isListening, setIsListening] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'realtime' | 'batch' | null>(null)
  const [liveText, setLiveText] = useState('')
  const realtimeRef = useRef<RealtimeSttHandle | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listeningRef = useRef(false)
  // Segments are transcribed strictly one at a time so results reach
  // onSegment in spoken order even when an earlier request is slow.
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  // Frozen per start(): mid-recording settings edits must not switch the
  // transport/model for segments already being spoken.
  const targetRef = useRef({ useNetwork: networkConfigured, roomId, model: sttSettings.model, connection, language })
  const onSegmentRef = useRef(onSegment)
  onSegmentRef.current = onSegment

  function clearSegmentTimer(): void {
    if (segmentTimerRef.current === null) return
    clearTimeout(segmentTimerRef.current)
    segmentTimerRef.current = null
  }

  function enqueueSegment(blob: Blob, fileName: string): void {
    // Sub-1KB blobs are container headers with no audible audio; skip them.
    if (blob.size < 1024) return
    const target = targetRef.current
    setPendingCount((count) => count + 1)
    queueRef.current = queueRef.current
      .then(async () => {
        // The Network STT wire format has no language field; the hint is
        // direct-API only.
        const text = target.useNetwork
          ? await requestNetworkStt(target.roomId, { audio: blob, model: target.model, fileName })
          : await transcribeAudio({
              connection: target.connection,
              model: target.model,
              audio: blob,
              fileName,
              language: target.language,
            })
        if (text.trim()) onSegmentRef.current(text.trim())
      })
      .catch((segmentError) => {
        setError(localizeNetworkError(segmentError, t('stt-transcription-failed')))
      })
      .finally(() => setPendingCount((count) => count - 1))
  }

  function startSegmentRecorder(stream: MediaStream): void {
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'audio/webm'
      enqueueSegment(new Blob(chunks, { type: mimeType }), `segment.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`)
      if (listeningRef.current && streamRef.current) startSegmentRecorder(streamRef.current)
    }
    recorderRef.current = recorder
    recorder.start()
    clearSegmentTimer()
    segmentTimerRef.current = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, sttSegmentIntervalMs)
  }

  async function start(): Promise<void> {
    if (!configured || listeningRef.current) return
    listeningRef.current = true
    setError('')
    targetRef.current = { useNetwork: networkConfigured, roomId, model: sttSettings.model, connection, language }

    // Realtime first (direct API only - the Network transport has no
    // streaming STT). A server without the realtime endpoint fails the
    // WebSocket connect and we silently fall through to the batch path.
    if (apiConfigured) {
      try {
        const handle = await startRealtimeStt({
          connection,
          model: sttSettings.model,
          micDeviceId: sttSettings.micDeviceId,
          language,
          onDelta: (delta) => setLiveText((current) => current + delta),
          onSegment: (text) => {
            setLiveText('')
            if (text.trim()) onSegmentRef.current(text.trim())
          },
          onError: (message) => setError(message),
          onClose: () => {
            realtimeRef.current = null
            listeningRef.current = false
            setIsListening(false)
            setMode(null)
            setLiveText('')
            setError(t('stt-transcription-failed'))
          },
        })
        if (!listeningRef.current) {
          handle.stop()
          return
        }
        realtimeRef.current = handle
        setMode('realtime')
        setIsListening(true)
        return
      } catch {
        setLiveText('')
      }
    }

    if (!listeningRef.current) return
    try {
      // Plain (non-exact) deviceId falls back to the default input when the
      // chosen mic is unplugged, mirroring hooks/useTranscription.
      const micDeviceId = sttSettings.micDeviceId.trim()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: micDeviceId } : true,
      })
      if (!listeningRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      setMode('batch')
      setIsListening(true)
      startSegmentRecorder(stream)
    } catch (permissionError) {
      listeningRef.current = false
      setError(permissionError instanceof Error ? permissionError.message : t('stt-mic-denied'))
    }
  }

  function stop(): void {
    clearSegmentTimer()
    listeningRef.current = false
    setIsListening(false)
    setMode(null)
    setLiveText('')
    realtimeRef.current?.stop()
    realtimeRef.current = null
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  function toggle(): void {
    if (listeningRef.current) stop()
    else void start()
  }

  useEffect(() => stop, [])

  return { configured, isListening, isTranscribing: pendingCount > 0, error, mode, liveText, toggle }
}
