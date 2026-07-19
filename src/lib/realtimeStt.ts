import { normalizeBaseUrl } from './format'
import type { VoiceConnection } from './voice'

// OpenAI Realtime API-compatible streaming transcription
// (`/v1/realtime?intent=transcription` over WebSocket): mic audio is captured
// at 24 kHz, converted to PCM16, and streamed as base64
// `input_audio_buffer.append` events; the server answers with
// `conversation.item.input_audio_transcription.delta` while a turn is being
// spoken and `.completed` (full transcript) when its server-side VAD closes
// the turn. Callers treat a failed connect as "server doesn't speak realtime"
// and fall back to the batch /audio/transcriptions path.

export type RealtimeSttHandle = { stop: () => void }

const openTimeoutMs = 5000

function toRealtimeUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl).replace(/^http/, 'ws')}/realtime?intent=transcription`
}

function pcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  // btoa needs a binary string; build it in chunks to keep the argument list
  // to String.fromCharCode below the engine's call-stack limit.
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function startRealtimeStt(params: {
  connection: VoiceConnection
  model: string
  micDeviceId: string
  /** ISO-639-1 hint for the recognizer (e.g. 'ja'); omit for auto-detect. */
  language?: string
  onDelta: (text: string) => void
  onSegment: (text: string) => void
  onError: (message: string) => void
  /** Fired when the server closes the socket after a successful start. */
  onClose: () => void
}): Promise<RealtimeSttHandle> {
  return new Promise((resolve, reject) => {
    const apiKey = params.connection.apiKey.trim()
    let ws: WebSocket
    try {
      // Browser WebSockets can't set an Authorization header; OpenAI accepts
      // the key via subprotocols instead. Local keyless servers get a plain
      // connection - some reject unknown subprotocols, so only send them
      // when there's actually a key to convey.
      ws = apiKey
        ? new WebSocket(toRealtimeUrl(params.connection.baseUrl), [
            'realtime',
            `openai-insecure-api-key.${apiKey}`,
            'openai-beta.realtime-v1',
          ])
        : new WebSocket(toRealtimeUrl(params.connection.baseUrl))
    } catch (createError) {
      reject(createError)
      return
    }

    let opened = false
    let stopped = false
    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let processor: ScriptProcessorNode | null = null

    const openTimer = setTimeout(() => {
      if (!opened) {
        ws.close()
        reject(new Error('Realtime transcription connection timed out.'))
      }
    }, openTimeoutMs)

    function cleanup(): void {
      clearTimeout(openTimer)
      if (processor) processor.onaudioprocess = null
      processor?.disconnect()
      source?.disconnect()
      void audioContext?.close().catch(() => {})
      stream?.getTracks().forEach((track) => track.stop())
      processor = null
      source = null
      audioContext = null
      stream = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }

    function stop(): void {
      if (stopped) return
      stopped = true
      cleanup()
    }

    ws.onopen = () => {
      opened = true
      clearTimeout(openTimer)
      ws.send(
        JSON.stringify({
          type: 'transcription_session.update',
          session: {
            input_audio_format: 'pcm16',
            input_audio_transcription: {
              model: params.model.trim(),
              ...(params.language?.trim() ? { language: params.language.trim() } : {}),
            },
            turn_detection: { type: 'server_vad' },
          },
        }),
      )
      void (async () => {
        try {
          // Plain (non-exact) deviceId falls back to the default input when
          // the chosen mic is unplugged, mirroring hooks/useTranscription.
          const micDeviceId = params.micDeviceId.trim()
          stream = await navigator.mediaDevices.getUserMedia({
            audio: micDeviceId ? { deviceId: micDeviceId } : true,
          })
          audioContext = new AudioContext({ sampleRate: 24000 })
          source = audioContext.createMediaStreamSource(stream)
          processor = audioContext.createScriptProcessor(4096, 1, 1)
          processor.onaudioprocess = (event) => {
            if (stopped || ws.readyState !== WebSocket.OPEN) return
            ws.send(
              JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm16Base64(event.inputBuffer.getChannelData(0)) }),
            )
          }
          source.connect(processor)
          // ScriptProcessor only runs while connected to the graph's output;
          // it produces silence, so nothing audible comes out of this.
          processor.connect(audioContext.destination)
          resolve({ stop })
        } catch (micError) {
          cleanup()
          reject(micError)
        }
      })()
    }

    ws.onmessage = (event) => {
      let message: { type?: string; delta?: string; transcript?: string; error?: { message?: string } }
      try {
        message = JSON.parse(String(event.data)) as typeof message
      } catch {
        return
      }
      if (message.type === 'conversation.item.input_audio_transcription.delta') {
        if (message.delta) params.onDelta(message.delta)
      } else if (message.type === 'conversation.item.input_audio_transcription.completed') {
        params.onSegment(message.transcript ?? '')
      } else if (message.type === 'error') {
        params.onError(message.error?.message || 'Realtime transcription error.')
      }
    }

    ws.onerror = () => {
      if (!opened) {
        clearTimeout(openTimer)
        reject(new Error('Realtime transcription connection failed.'))
      }
    }

    ws.onclose = () => {
      if (!opened) {
        clearTimeout(openTimer)
        reject(new Error('Realtime transcription connection closed.'))
        return
      }
      if (!stopped) {
        stop()
        params.onClose()
      }
    }
  })
}
