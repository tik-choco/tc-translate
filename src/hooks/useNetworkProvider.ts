import { useEffect, useRef, useState } from 'preact/hooks'
import {
  useNetworkProvider as useMistaiNetworkProvider,
  type NetworkProviderPeer,
  type NetworkProviderStatus,
} from '@tik-choco/mistai/preact'
import { t } from '../i18n'
import { requestApiChatCompletionStreaming } from '../lib/llm'
import { createMistNode, NODE_ID_STORAGE_KEY } from '../lib/network'
import { normalizeBaseUrl } from '../lib/format'
import { resolveSttConnection, resolveTtsConnection, synthesizeSpeech, transcribeAudio } from '../lib/voice'
import type { SharedLlmConfigV1 } from '../lib/llmConfig'
import type { ProviderSettings, SttSettings, TtsSettings } from '../types'

export type { NetworkProviderPeer, NetworkProviderStatus }

/**
 * Owns the "participate as an LLM Network provider" lifecycle: joins/leaves
 * the configured room, forwards llm_request traffic to the user's configured
 * upstream API, and surfaces connection/peer/request-log state for the UI.
 *
 * Independent of `settings.connection` — provider mode can run alongside a
 * consumer using direct API for its own translations.
 *
 * Thin wrapper over @tik-choco/mistai's useNetworkProvider: this hook only
 * binds the app's settings objects to the library's injected upstream
 * functions (chat / TTS / STT).
 */
export function useNetworkProvider(
  settings: ProviderSettings,
  ttsSettings: TtsSettings,
  sttSettings: SttSettings,
  llmConfig: SharedLlmConfigV1,
) {
  // Ride the settings in refs so in-flight requests always see the latest
  // values without retriggering the room join effect (same as before).
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const ttsSettingsRef = useRef(ttsSettings)
  ttsSettingsRef.current = ttsSettings
  const sttSettingsRef = useRef(sttSettings)
  sttSettingsRef.current = sttSettings
  const llmConfigRef = useRef(llmConfig)
  llmConfigRef.current = llmConfig

  const upstreamConfigured = Boolean(settings.model.trim() && normalizeBaseUrl(settings.baseUrl))

  // mistai v0.4.0 derives the advertised provider_hello.services list from
  // which of callLlm/synthesize/transcribe are actually injected (see
  // deriveHelloServices in @tik-choco/mistai/preact). Only pass synthesize /
  // transcribe when a TTS/STT upstream is actually configured, so this
  // provider doesn't advertise "tts"/"stt" support it can't deliver on -
  // otherwise consumers would route voice requests here and always hit the
  // "missing" throw below instead of failing over to a provider that can
  // actually serve them.
  const ttsConfigured = Boolean(resolveTtsConnection(llmConfig).baseUrl)
  const sttConfigured = Boolean(resolveSttConnection(llmConfig).baseUrl)

  const [debouncedRoomId, setDebouncedRoomId] = useState(settings.roomId)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRoomId(settings.roomId), 500)
    return () => clearTimeout(timer)
  }, [settings.roomId])

  const result = useMistaiNetworkProvider({
    enabled: settings.networkProviderEnabled && upstreamConfigured,
    roomId: debouncedRoomId,
    createNode: createMistNode,
    nodeIdStorageKey: NODE_ID_STORAGE_KEY,
    callLlm: (messages, model, onDelta) =>
      requestApiChatCompletionStreaming(settingsRef.current, messages, model, onDelta),
    synthesize: ttsConfigured
      ? async (text, model, voice) => {
          const conn = resolveTtsConnection(llmConfigRef.current)
          if (!conn.baseUrl) throw new Error(t('network-provider-tts-missing'))
          const blob = await synthesizeSpeech({
            connection: conn,
            model: model || ttsSettingsRef.current.model,
            voice: voice || ttsSettingsRef.current.voice,
            text,
          })
          return { blob, mime: blob.type || 'audio/mpeg' }
        }
      : undefined,
    transcribe: sttConfigured
      ? async (audio, _mime, model, fileName) => {
          const conn = resolveSttConnection(llmConfigRef.current)
          if (!conn.baseUrl) throw new Error(t('network-provider-stt-missing'))
          return transcribeAudio({ connection: conn, model: model || sttSettingsRef.current.model, audio, fileName })
        }
      : undefined,
  })

  return {
    ...result,
    errorMessage: result.errorMessage ?? '',
    ownNodeId: result.ownNodeId ?? '',
    upstreamConfigured,
  }
}
