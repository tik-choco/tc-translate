import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { MistaiError, fetchVoices } from '@tik-choco/mistai'
import type { NetworkProviderPeer, NetworkProviderStatus } from '@tik-choco/mistai/preact'
import { t } from '../i18n'
import { requestResolvedChatCompletionStreaming } from '../lib/llm'
import { resolveModelExact, resolveVoice, type ModelRefV1, type ResolvedLlmTargetV1, type SharedLlmConfigV1 } from '../lib/llmConfig'
import { createMistNode, NODE_ID_STORAGE_KEY } from '../lib/network'
import { roomIdFromBaseUrl, isNetworkProviderBaseUrl } from '../lib/networkModels'
import { OAI_TUNNEL_SERVICE } from '../lib/p2p/protocol'
import { OaiTunnelProvider, type OaiUpstreamResolver } from '../lib/p2p/tunnel'
import { useMistaiNetworkProvider } from './useMistaiProvider'
import { resolveSttConnection, resolveTtsConnection, synthesizeSpeech, transcribeAudio } from '../lib/voice'
import type { ProviderSettings, RoomProvide, SttSettings, TtsSettings } from '../types'

export type { NetworkProviderPeer, NetworkProviderStatus }

export function resolveSharedTargets(config: SharedLlmConfigV1, refs: ModelRefV1[]): ResolvedLlmTargetV1[] {
  return refs.map(ref => resolveModelExact(config, ref)).filter((t): t is ResolvedLlmTargetV1 => !!t && !isNetworkProviderBaseUrl(t.baseUrl))
}

export function inboundTarget(config: SharedLlmConfigV1, shared: ModelRefV1[], model?: string): ResolvedLlmTargetV1 | null {
  const targets = resolveSharedTargets(config, shared)
  if (model) {
    const match = targets.find(t => t.model === model)
    if (match) return match
    if (shared.length) throw new Error('model_not_shared')
  }
  const target = resolveModelExact(config, config.defaultModel)
  return target && !isNetworkProviderBaseUrl(target.baseUrl) ? target : targets[0] ?? null
}

export function useNetworkProvider(
  settings: ProviderSettings,
  ttsSettings: TtsSettings,
  sttSettings: SttSettings,
  llmConfig: SharedLlmConfigV1,
  roomProviderId: string,
  provide: RoomProvide,
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

  // Share-list order is preserved for inbound routing.
  const sharedTargets = useMemo(
    () => resolveSharedTargets(llmConfig, provide.shared),
    [llmConfig, provide.shared],
  )

  // Advertise raw model IDs; edits rebroadcast without rejoining.
  const advertisedModelsKey = [...new Set(sharedTargets.map(t => t.model))].sort().join('\n')
  const advertisedModels = useMemo(
    () => (advertisedModelsKey ? advertisedModelsKey.split('\n') : []),
    [advertisedModelsKey],
  )

  const upstreamConfigured =
    sharedTargets.length > 0 ||
    Boolean(inboundTarget(llmConfig, provide.shared))

  // mistai v0.4.0 derives the advertised provider_hello.services list from
  // which of callLlm/synthesize/transcribe are actually injected (see
  // deriveHelloServices in @tik-choco/mistai/preact). Only pass synthesize /
  // transcribe when a TTS/STT upstream is actually configured, so this
  // provider doesn't advertise "tts"/"stt" support it can't deliver on -
  // otherwise consumers would route voice requests here and always hit the
  // "missing" throw below instead of failing over to a provider that can
  // actually serve them. Also exclude a resolved connection whose baseUrl is
  // itself a `mist-network://` pseudo-provider: this provider's own TTS/STT
  // model is "unset -> use the network", so advertising the capability would
  // just loop the request straight back into the room it came from.
  const ttsConnection = resolveTtsConnection(llmConfig)
  const ttsConfigured = Boolean(ttsConnection.baseUrl && !isNetworkProviderBaseUrl(ttsConnection.baseUrl))
  const sttConfigured = Boolean(
    resolveSttConnection(llmConfig).baseUrl && !isNetworkProviderBaseUrl(resolveSttConnection(llmConfig).baseUrl),
  )

  // TTS voice names to advertise via provider_hello.voices (tts-voice-selection-v1
  // §2.1/§2.5): fetched from the resolved TTS upstream (fetchVoices, promoted
  // to mistai in v0.6.0) whenever it resolves to a real HTTP connection -
  // mirrors ttsConfigured's guard exactly, so this never probes/advertises
  // through the mist-network:// loopback. Debounced like the other
  // connection-driven fetches in Settings, so rapid provider edits don't fire
  // a request per keystroke. A fetch failure (fetchVoices itself never
  // throws, but the catch is defensive) or an unconfigured connection
  // advertises no voices at all - never falling back to a static list, since
  // this provider might not actually support any of those names.
  const [fetchedTtsVoices, setFetchedTtsVoices] = useState<string[]>([])
  useEffect(() => {
    if (!ttsConfigured) {
      setFetchedTtsVoices([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      fetchVoices(ttsConnection.baseUrl, ttsConnection.apiKey)
        .then((voices) => {
          if (!cancelled) setFetchedTtsVoices(voices)
        })
        .catch(() => {
          if (!cancelled) setFetchedTtsVoices([])
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsConfigured, ttsConnection.baseUrl, ttsConnection.apiKey])

  // provider_hello.voices is capped at 64 entries (§2.1) so the hello payload
  // stays comfortably under mist's ~16KB message-size guard; truncation isn't
  // surfaced in the UI (a documented v1 limitation).
  const advertisedVoices = useMemo(() => fetchedTtsVoices.slice(0, 64), [fetchedTtsVoices])

  const provider = llmConfig.providers.find(p => p.id === roomProviderId)
  const roomId = provider ? roomIdFromBaseUrl(provider.baseUrl) : ''
  const provideRef = useRef(provide)
  provideRef.current = provide
  const resolveOaiUpstream: OaiUpstreamResolver = (path, body) => {
    if (!['/chat/completions', '/models', '/embeddings'].includes(path)) return null
    const requested = typeof (body as { model?: unknown })?.model === 'string' ? (body as { model: string }).model : ''
    const target = inboundTarget(llmConfigRef.current, provideRef.current.shared, requested)
    if (!target) return null
    return {
      baseUrl: target.baseUrl, apiKey: target.apiKey,
      rewriteBody: b => {
        const { temperature: _temperature, ...rest } = (b ?? {}) as Record<string, unknown>
        return { ...rest, model: target.model, ...(path === '/chat/completions' ? { stream: false } : {}) }
      },
    }
  }

  const result = useMistaiNetworkProvider({
    enabled: provider?.enabled !== false && provide.enabled && !!roomId,
    roomId: roomId,
    createNode: nodeId => createMistNode(nodeId, roomId),
    nodeIdStorageKey: NODE_ID_STORAGE_KEY,
    extraServices: upstreamConfigured ? [OAI_TUNNEL_SERVICE] : [],
    createTunnelProvider: (send) => new OaiTunnelProvider(send, resolveOaiUpstream),
    callLlm: upstreamConfigured ? (messages, model, onDelta) => {
      const target = inboundTarget(llmConfigRef.current, provideRef.current.shared, model)
      if (!target) throw new MistaiError('ENDPOINT_NOT_CONFIGURED', 'No usable HTTP model configured.')
      return requestResolvedChatCompletionStreaming({ ...target, reasoningEffort: settingsRef.current.defaultReasoningEffort }, messages, onDelta)
    } : undefined,
    advertisedModels: advertisedModels.length ? advertisedModels : undefined,
    advertisedVoices: advertisedVoices.length ? advertisedVoices : undefined,
    synthesize: ttsConfigured
      ? async (text, model, voice, lang) => {
          const conn = resolveTtsConnection(llmConfigRef.current)
          // Config may have changed since ttsConfigured was computed (e.g. the
          // resolved model got unset, falling back to the network
          // pseudo-provider) - re-check here too, so we never forward into
          // the network room this capability was advertised to.
          if (!conn.baseUrl || isNetworkProviderBaseUrl(conn.baseUrl)) throw new Error(t('network-provider-tts-missing'))
          const ownTtsModel = ttsSettingsRef.current.model
          // TODO: `lang` isn't used yet to pick a language-specific voice - synthesizeSpeech always uses ownTtsModel's single configured voice.
          void lang
          const blob = await synthesizeSpeech({
            connection: conn,
            model: model === ownTtsModel ? model : (resolveVoice(llmConfigRef.current, 'tts')?.model ?? ownTtsModel),
            voice: voice || ttsSettingsRef.current.voice,
            text,
          })
          return { blob, mime: blob.type || 'audio/mpeg' }
        }
      : undefined,
    transcribe: sttConfigured
      ? async (audio, _mime, model, fileName) => {
          const conn = resolveSttConnection(llmConfigRef.current)
          // Same re-check as synthesize above: never loop back into the
          // network room this capability was advertised to.
          if (!conn.baseUrl || isNetworkProviderBaseUrl(conn.baseUrl)) throw new Error(t('network-provider-stt-missing'))
          const ownSttModel = sttSettingsRef.current.model
          return transcribeAudio({ connection: conn, model: model === ownSttModel ? model : (resolveVoice(llmConfigRef.current, 'stt')?.model ?? ownSttModel), audio, fileName })
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
