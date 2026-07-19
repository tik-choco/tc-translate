import { MistaiError } from '@tik-choco/mistai'
import { resolvePreset, resolveVoice, type SharedLlmConfigV1 } from './llmConfig'
import { isNetworkProviderBaseUrl } from './networkModels'
import type { VoiceEngine } from '../types'

export type VoiceConnection = {
  baseUrl: string
  apiKey: string
}

// TTS/STT connection info (baseUrl/apiKey) comes from the shared llm config's
// `tts`/`stt` provider - explicit if set, otherwise the default preset's
// provider (see resolveVoice in lib/llmConfig.ts). Callers resolve through
// these helpers rather than reading the shared config directly so a missing
// provider degrades to an empty (falsy) connection instead of throwing.
export function resolveTtsConnection(config: SharedLlmConfigV1): VoiceConnection {
  const resolved = resolveVoice(config, 'tts')
  return { baseUrl: resolved?.baseUrl ?? '', apiKey: resolved?.apiKey ?? '' }
}

export function resolveSttConnection(config: SharedLlmConfigV1): VoiceConnection {
  const resolved = resolveVoice(config, 'stt')
  return { baseUrl: resolved?.baseUrl ?? '', apiKey: resolved?.apiKey ?? '' }
}

/**
 * Derives the TTS/STT engine ('browser' | 'api' | 'network') from the shared
 * llm config instead of an app-local setting:
 * - `config.tts`/`config.stt` absent, or its `model` blank -> 'browser'.
 * - Otherwise resolve the provider the same way resolveVoice does: the
 *   explicit `providerId` if set, else the default preset's provider (an
 *   explicit `providerId` that's dangling does NOT fall back to the default
 *   preset - that's the "unresolved" case below). If that provider's
 *   `baseUrl` starts with `mist-network://` (see isNetworkProviderBaseUrl in
 *   networkModels.ts) -> 'network'; any other baseUrl -> 'api'.
 * - A model IS set but the provider can't be resolved (dangling providerId,
 *   or no default preset) -> 'api', so the settings UI can still show its
 *   "connection unresolved" warning (the actual TTS/STT call falls back to
 *   the browser engine at runtime when the connection resolves empty).
 */
export function deriveVoiceEngine(config: SharedLlmConfigV1, kind: 'tts' | 'stt'): VoiceEngine {
  const cfg = config[kind]
  if (!cfg || !cfg.model) return 'browser'

  const provider = cfg.providerId
    ? config.providers.find((p) => p.id === cfg.providerId)
    : (() => {
        const defaultTarget = resolvePreset(config)
        return defaultTarget ? config.providers.find((p) => p.id === defaultTarget.providerId) : undefined
      })()
  if (!provider) return 'api'

  return isNetworkProviderBaseUrl(provider.baseUrl) ? 'network' : 'api'
}

function authHeaders(apiKey: string): HeadersInit {
  return apiKey.trim() ? { Authorization: `Bearer ${apiKey}` } : {}
}

export async function synthesizeSpeech(params: {
  connection: VoiceConnection
  model: string
  voice: string
  text: string
  signal?: AbortSignal
}): Promise<Blob> {
  const response = await fetch(`${params.connection.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.connection.apiKey),
    },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model.trim(),
      input: params.text,
      voice: params.voice.trim() || 'alloy',
      response_format: 'mp3',
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined)
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `Speech request failed with ${response.status}`
    throw new MistaiError('UPSTREAM_HTTP_ERROR', message, { status: response.status })
  }

  return response.blob()
}

export async function transcribeAudio(params: {
  connection: VoiceConnection
  model: string
  audio: Blob
  fileName?: string
  /** ISO-639-1 hint for the recognizer (e.g. 'ja'); omit for auto-detect. */
  language?: string
}): Promise<string> {
  // fileName can be peer-supplied (LLM Network STT), so strip path separators,
  // quotes, and CR/LF before it lands in the multipart Content-Disposition header.
  const safeFileName = (params.fileName ?? 'recording.webm').replace(/[\r\n"\\/]+/g, '_').slice(0, 255)

  const form = new FormData()
  form.append('file', params.audio, safeFileName)
  form.append('model', params.model.trim())
  if (params.language?.trim()) form.append('language', params.language.trim())

  const response = await fetch(`${params.connection.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: authHeaders(params.connection.apiKey),
    body: form,
  })

  const payload = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `Transcription failed with ${response.status}`
    throw new MistaiError('UPSTREAM_HTTP_ERROR', message, { status: response.status })
  }

  const text = payload?.text
  if (typeof text !== 'string' || !text.trim()) {
    throw new MistaiError('UPSTREAM_BAD_RESPONSE', 'The provider returned an empty transcription.')
  }

  return text
}
