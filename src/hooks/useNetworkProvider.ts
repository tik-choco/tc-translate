import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { MistaiError, fetchVoices } from '@tik-choco/mistai'
import type { NetworkProviderPeer, NetworkProviderStatus } from '@tik-choco/mistai/preact'
import { t } from '../i18n'
import { requestApiChatCompletionStreaming, requestResolvedChatCompletionStreaming } from '../lib/llm'
import { resolvePreset, type ResolvedLlmTargetV1, type SharedLlmConfigV1 } from '../lib/llmConfig'
import { createMistNode, NODE_ID_STORAGE_KEY } from '../lib/network'
import { advertisedModelName, isNetworkProviderBaseUrl } from '../lib/networkModels'
import { OAI_TUNNEL_SERVICE } from '../lib/p2p/protocol'
import { OaiTunnelProvider, type OaiUpstreamResolver } from '../lib/p2p/tunnel'
import { useMistaiNetworkProvider } from './useMistaiProvider'
import { normalizeBaseUrl } from '../lib/format'
import { resolveSttConnection, resolveTtsConnection, synthesizeSpeech, transcribeAudio } from '../lib/voice'
import type { ProviderSettings, SttSettings, TtsSettings } from '../types'

export type { NetworkProviderPeer, NetworkProviderStatus }

/**
 * Resolves `presetIds` (the model presets the user checked to share, see
 * `LocalProviderSettings.networkProviderPresetIds`) against the shared llm
 * config. Drops ids that no longer resolve, ids whose resolution silently
 * fell back to the shared default preset (see `resolvePreset`'s fallback -
 * this guards against re-sharing the default preset under a stale/removed
 * id), and any target whose baseUrl is itself a `mist-network://`
 * pseudo-provider - re-advertising a network-imported preset would loop
 * traffic straight back into the room it came from.
 */
export function resolveSharedTargets(llmConfig: SharedLlmConfigV1, presetIds: string[]): ResolvedLlmTargetV1[] {
  const targets: ResolvedLlmTargetV1[] = []
  for (const id of presetIds) {
    const resolved = resolvePreset(llmConfig, id)
    if (!resolved || resolved.presetId !== id) continue
    if (isNetworkProviderBaseUrl(resolved.baseUrl)) continue
    targets.push(resolved)
  }
  return targets
}

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

  // Presets the user explicitly checked to share (settings.networkProviderPresetIds),
  // resolved to concrete connections. Kept in a ref (like the settings above)
  // so callLlm always sees the latest set without retriggering the room join.
  const sharedTargets = useMemo(
    () => resolveSharedTargets(llmConfig, settings.networkProviderPresetIds),
    [llmConfig, settings.networkProviderPresetIds],
  )
  const sharedTargetsRef = useRef(sharedTargets)
  sharedTargetsRef.current = sharedTargets

  // What each shared preset is advertised as in provider_hello.models: its
  // label, falling back to the model id (see advertisedModelName). Deduped,
  // sorted and joined into a single string so the useMemo below doesn't
  // retrigger on array-identity churn when the underlying set hasn't actually
  // changed. Share-list edits propagate to already-connected consumers
  // without dropping the session: the forked hook (useMistaiProvider)
  // re-broadcasts provider_hello in place whenever this set changes.
  const advertisedModelsKey = [...new Set(sharedTargets.map(advertisedModelName))].sort().join('\n')
  const advertisedModels = useMemo(
    () => (advertisedModelsKey ? advertisedModelsKey.split('\n') : []),
    [advertisedModelsKey],
  )

  // The legacy single-upstream connection counts as "configured" only when
  // it's an actual HTTP endpoint - a default preset that resolves to a
  // `mist-network://` pseudo-provider can't be forwarded upstream into the
  // network it came from. Sharing via the checkboxes (sharedTargets) is
  // independently sufficient even without a legacy upstream.
  const upstreamConfigured =
    sharedTargets.length > 0 ||
    (Boolean(settings.model.trim() && normalizeBaseUrl(settings.baseUrl)) && !isNetworkProviderBaseUrl(settings.baseUrl))

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

  const [debouncedRoomId, setDebouncedRoomId] = useState(settings.roomId)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedRoomId(settings.roomId), 500)
    return () => clearTimeout(timer)
  }, [settings.roomId])

  // Resolves which upstream serves an incoming oai_* tunnel request (an
  // OpenAI-compatible HTTP call proxied over P2P, see '../lib/p2p/tunnel').
  // Consumer-supplied auth never exists on the wire - whichever upstream is
  // chosen here is always forwarded to with THIS provider's own api key, the
  // same as callLlm above. Paths are allowlisted; anything not matched below
  // returns null and the tunnel answers with an 'unsupported_path' error
  // instead of forwarding an arbitrary path to an upstream. Reads refs (not
  // the closed-over settings/llmConfig/sharedTargets props) so it stays
  // correct across renders without needing to be recreated on every one -
  // it's invoked from inside the per-session tunnel-provider factory below.
  const resolveOaiUpstream: OaiUpstreamResolver = (path, body) => {
    const targets = sharedTargetsRef.current
    const settingsNow = settingsRef.current

    if (path === '/chat/completions') {
      const bodyObj = body as { model?: unknown } | undefined
      const requested = typeof bodyObj?.model === 'string' ? bodyObj.model : ''
      const matched = targets.find((target) => advertisedModelName(target) === requested)
      if (matched) {
        return {
          baseUrl: matched.baseUrl,
          apiKey: matched.apiKey,
          // stream:false - the tunnel is single-shot v1 (no chunked delta relay yet).
          rewriteBody: (b) => ({ ...(b as object), model: matched.model, stream: false }),
        }
      }
      // Same share-list policy as callLlm below: a named model that isn't in
      // the advertised set is refused (relayed as 'request_rejected'), never
      // silently served by another upstream/model. Model-less requests fall
      // through to the default-upstream choices.
      if (requested && targets.length > 0) {
        throw new MistaiError('ENDPOINT_NOT_CONFIGURED', 'The requested model is not shared by this provider.')
      }
      if (!isNetworkProviderBaseUrl(settingsNow.baseUrl) && normalizeBaseUrl(settingsNow.baseUrl)) {
        return {
          baseUrl: settingsNow.baseUrl,
          apiKey: settingsNow.apiKey,
          rewriteBody: (b) => ({ ...(b as object), model: settingsNow.model, stream: false }),
        }
      }
      if (targets.length > 0) {
        const first = targets[0]
        return {
          baseUrl: first.baseUrl,
          apiKey: first.apiKey,
          rewriteBody: (b) => ({ ...(b as object), model: first.model, stream: false }),
        }
      }
      return null
    }

    if (path === '/models' || path === '/embeddings') {
      // /embeddings: no rewriteBody - embeddings models aren't label-mapped
      // to shared-target models yet, so the requested model rides through
      // unchanged instead of being rewritten like /chat/completions above.
      if (targets.length > 0) return { baseUrl: targets[0].baseUrl, apiKey: targets[0].apiKey }
      if (!isNetworkProviderBaseUrl(settingsNow.baseUrl) && normalizeBaseUrl(settingsNow.baseUrl)) {
        return { baseUrl: settingsNow.baseUrl, apiKey: settingsNow.apiKey }
      }
      return null
    }

    return null
  }

  const result = useMistaiNetworkProvider({
    enabled: settings.networkProviderEnabled && upstreamConfigured,
    roomId: debouncedRoomId,
    createNode: createMistNode,
    nodeIdStorageKey: NODE_ID_STORAGE_KEY,
    extraServices: [OAI_TUNNEL_SERVICE],
    createTunnelProvider: (send) => new OaiTunnelProvider(send, resolveOaiUpstream),
    callLlm: (messages, model, onDelta) => {
      const targets = sharedTargetsRef.current
      // A model-specific llm_request: the requested name is the advertised
      // name (label-or-model, see advertisedModelName) echoed back by the
      // consumer - map it to the matching shared preset and forward via that
      // preset's own connection, not the single legacy upstream (which may
      // not even offer this model).
      if (model) {
        const matched = targets.find((target) => advertisedModelName(target) === model)
        if (matched) return requestResolvedChatCompletionStreaming(matched, messages, onDelta)
        // A model was named but isn't in the current share list. While this
        // provider advertises a list at all, honoring the request anyway
        // (e.g. by forwarding the raw name to the legacy upstream) would let
        // consumers keep using entries the user just un-shared - stale
        // imported cards, or hand-crafted requests naming real upstream model
        // ids. Refuse instead; only a provider with NO advertised list
        // (legacy single-upstream mode) still forwards named requests below.
        if (targets.length > 0) {
          throw new MistaiError('ENDPOINT_NOT_CONFIGURED', 'The requested model is not shared by this provider.')
        }
      }
      // No model requested (or one was, but nothing is advertised - legacy
      // single-upstream mode): the legacy default-preset upstream normally
      // answers these, EXCEPT when that default preset is itself a
      // network-imported preset (forwarding there
      // would loop the request back into the room it came from) - in that
      // case fall back to the first shared target instead, so a provider
      // sharing only via the checkboxes still answers model-less requests.
      if (isNetworkProviderBaseUrl(settingsRef.current.baseUrl) && targets.length) {
        return requestResolvedChatCompletionStreaming(targets[0], messages, onDelta)
      }
      return requestApiChatCompletionStreaming(settingsRef.current, messages, model, onDelta)
    },
    advertisedModels: advertisedModels.length ? advertisedModels : undefined,
    advertisedVoices: advertisedVoices.length ? advertisedVoices : undefined,
    synthesize: ttsConfigured
      ? async (text, model, voice) => {
          const conn = resolveTtsConnection(llmConfigRef.current)
          // Config may have changed since ttsConfigured was computed (e.g. the
          // resolved model got unset, falling back to the network
          // pseudo-provider) - re-check here too, so we never forward into
          // the network room this capability was advertised to.
          if (!conn.baseUrl || isNetworkProviderBaseUrl(conn.baseUrl)) throw new Error(t('network-provider-tts-missing'))
          // The requested model is whatever the consumer's picker stored -
          // typically an advertised chat-preset name (a label, not a model id
          // in this provider's TTS catalog) - so it's only forwarded upstream
          // when it matches this provider's own configured TTS model;
          // anything else falls back to that own model instead of erroring.
          const ownTtsModel = ttsSettingsRef.current.model
          const blob = await synthesizeSpeech({
            connection: conn,
            model: model === ownTtsModel ? model : ownTtsModel,
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
          // Same requested-model policy as synthesize above.
          const ownSttModel = sttSettingsRef.current.model
          return transcribeAudio({ connection: conn, model: model === ownSttModel ? model : ownSttModel, audio, fileName })
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
