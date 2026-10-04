import { MistaiError, streamChatCompletion, type OpenAIConfig } from '@tik-choco/mistai'
import { withAbort } from './abort'
import { normalizeBaseUrl } from './format'
import { requestNetworkChat } from './network'
import { roomIdFromBaseUrl, isNetworkProviderBaseUrl } from '@tik-choco/mistai/llm-config'
import type { ChatMessage } from '@tik-choco/mistai'
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
  /** Called with the reply accumulated so far as it streams in (both transports). */
  onProgress?: (content: string) => void
}): Promise<string> {
  // The network room's ConsumerService has no cancel API, so `signal` can't
  // abort that request at the transport level - withAbort below still makes
  // the caller stop waiting on it immediately, it just leaves the (now
  // unobserved) request running in the background.
  if (!params.settings.baseUrl || !params.settings.model) throw new Error('No usable default model configured.')
  const request = isNetworkProviderBaseUrl(params.settings.baseUrl)
    ? requestNetworkChat(roomIdFromBaseUrl(params.settings.baseUrl), params.messages, params.settings.model,
        params.onProgress ? (_delta, full) => params.onProgress?.(full) : undefined)
    : requestApiChatCompletion(params.settings, params.messages, params.signal, params.onProgress)

  return params.signal ? withAbort(request, params.signal) : request
}

// Maps the app's ProviderSettings onto the shared library's upstream config.
function apiConfig(settings: ProviderSettings, model?: string): OpenAIConfig {
  return {
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    apiKey: settings.apiKey,
    model: (model ?? settings.model).trim(),
    reasoningEffort: settings.reasoningEffort ?? 'none',
  }
}

async function requestApiChatCompletion(
  settings: ProviderSettings,
  messages: ChatRequestMessage[],
  signal?: AbortSignal,
  onProgress?: (content: string) => void,
): Promise<string> {
  let streamed = ''
  const onDelta = onProgress
    ? (delta: string) => {
        streamed += delta
        onProgress(streamed)
      }
    : undefined
  // streamChatCompletion doesn't take an AbortSignal, so inject it via a
  // custom fetchFn (same pattern as fetchModelIds in api.ts).
  const fetchWithSignal: typeof fetch = (input, init) => fetch(input, { ...init, signal })

  let content: string
  try {
    content = await streamChatCompletion(apiConfig(settings), messages, onDelta, signal ? fetchWithSignal : undefined)
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
