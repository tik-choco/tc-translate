import { MistaiError, streamChatCompletion, type OpenAIConfig } from '@tik-choco/mistai'
import { withAbort } from './abort'
import { normalizeBaseUrl } from './format'
import { requestNetworkChat } from './network'
import { isNetworkProviderBaseUrl } from './networkModels'
import type { ChatMessage } from '@tik-choco/mistai'
import type { ResolvedLlmTargetV1 } from './llmConfig'
import type { ProviderSettings } from '../types'

export type ChatRequestMessage = ChatMessage

// Routes a chat completion through the configured connection: a direct
// OpenAI-compatible HTTP call, or an llm_request over the LLM Network room.
// Both branches return the assistant's full reply text; callers parse it the
// same way regardless of transport.
export async function requestChatCompletion(params: {
  settings: ProviderSettings
  messages: ChatRequestMessage[]
  signal?: AbortSignal
}): Promise<string> {
  // The network room's ConsumerService has no cancel API, so `signal` can't
  // abort that request at the transport level - withAbort below still makes
  // the caller stop waiting on it immediately, it just leaves the (now
  // unobserved) request running in the background.
  const request =
    params.settings.connection === 'network'
      ? // Don't force this client's own (API-mode) model onto the request: the
        // room's provider falls back to its own configured model whenever no
        // model is specified (see apiConfig below), so omitting it here makes
        // the network connection automatically use whatever model the connected
        // peer has set up, instead of demanding a model name it may not offer.
        // Exception: when the resolved default preset is itself a
        // network-imported preset (pseudo-provider `mist-network://`), the
        // user explicitly picked one of the peer's advertised models, so
        // request it by name instead of falling back to the peer's default.
        requestNetworkChat(
          params.settings.roomId,
          params.messages,
          isNetworkProviderBaseUrl(params.settings.baseUrl) && params.settings.model.trim()
            ? params.settings.model.trim()
            : undefined,
        )
      : requestApiChatCompletion(params.settings, params.messages, params.signal)

  return params.signal ? withAbort(request, params.signal) : request
}

// Maps the app's ProviderSettings onto the shared library's upstream config.
function apiConfig(settings: ProviderSettings, model?: string): OpenAIConfig {
  return {
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    apiKey: settings.apiKey,
    model: (model ?? settings.model).trim(),
    temperature: settings.temperature,
    reasoningEffort: settings.reasoningEffort ?? 'none',
  }
}

// Streaming variant used by the LLM Network provider to forward llm_request
// traffic upstream: same OpenAI-compatible endpoint, but deltas are relayed
// to the consumer chunk-by-chunk instead of waiting for the full completion.
// The SSE plumbing lives in @tik-choco/mistai's streamChatCompletion.
export async function requestApiChatCompletionStreaming(
  settings: ProviderSettings,
  messages: ChatRequestMessage[],
  model: string | undefined,
  onDelta: (delta: string) => void,
): Promise<string> {
  const full = await streamChatCompletion(apiConfig(settings, model), messages, onDelta)

  if (!full.trim()) {
    throw new MistaiError('UPSTREAM_BAD_RESPONSE', 'The provider returned an empty response.')
  }

  return full
}

// Maps a resolved shared-config preset (see lib/llmConfig.ts's resolvePreset)
// onto the shared library's upstream config, mirroring apiConfig above.
// OpenAIConfig.temperature/reasoningEffort are already optional and typed as
// number|undefined / string|undefined, matching ResolvedLlmTargetV1 exactly,
// so no ReasoningEffort-union cast is needed here.
function resolvedTargetConfig(target: ResolvedLlmTargetV1): OpenAIConfig {
  return {
    baseUrl: normalizeBaseUrl(target.baseUrl),
    apiKey: target.apiKey,
    model: target.model.trim(),
    temperature: target.temperature,
    reasoningEffort: target.reasoningEffort ?? 'none',
  }
}

// Forwards an LLM Network request upstream via a specific resolved preset:
// used by the provider hook when an incoming llm_request's model matches one
// of the presets the user chose to share (networkProviderPresetIds), instead
// of the single upstream connection requestApiChatCompletionStreaming uses.
export async function requestResolvedChatCompletionStreaming(
  target: ResolvedLlmTargetV1,
  messages: ChatRequestMessage[],
  onDelta: (delta: string) => void,
): Promise<string> {
  const full = await streamChatCompletion(resolvedTargetConfig(target), messages, onDelta)

  if (!full.trim()) {
    throw new MistaiError('UPSTREAM_BAD_RESPONSE', 'The provider returned an empty response.')
  }

  return full
}

async function requestApiChatCompletion(
  settings: ProviderSettings,
  messages: ChatRequestMessage[],
  signal?: AbortSignal,
): Promise<string> {
  // streamChatCompletion doesn't take an AbortSignal, so inject it via a
  // custom fetchFn (same pattern as fetchModelIds in api.ts).
  const fetchWithSignal: typeof fetch = (input, init) => fetch(input, { ...init, signal })

  let content: string
  try {
    content = await streamChatCompletion(apiConfig(settings), messages, undefined, signal ? fetchWithSignal : undefined)
  } catch (err) {
    // streamChatCompletion wraps every fetch failure (aborts included) in a
    // MistaiError; resurface aborts so callers can keep their AbortError check.
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
    throw err
  }

  if (!content.trim()) {
    throw new MistaiError('UPSTREAM_BAD_RESPONSE', 'The provider returned an empty response.')
  }

  return content
}
