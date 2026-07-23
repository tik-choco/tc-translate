// App-side wiring for @tik-choco/mistai: injects the vendored mistlib node
// into the shared ConsumerClient and keeps the old function-style API so call
// sites read the same as before the migration. Also owns the Japanese
// localization of MistaiError codes (the library's messages are English).

import {
  ConsumerClient,
  MESSAGES_JA,
  formatMistaiError,
  type ConsumerStatus,
  type ConsumerStatusListener,
  type ChatMessage,
  type MistNodeLike,
} from '@tik-choco/mistai'
import { createSharedMistNode } from './mistNodeShared'
import { OaiTunnelClient } from './p2p/tunnel'

// Kept identical to the pre-migration key so existing installs keep their node id.
export const NODE_ID_STORAGE_KEY = 'tc-translate-mistllm-node-id-v1'

// Every network stack in the app (this consumer client, the provider hook,
// the OAI tunnel) resolves to ONE shared MistNode: mistlib-wasm only allows a
// single active node per page, but that node is multi-room - see
// lib/mistNodeShared.ts for the multiplexing.
export function createMistNode(nodeId: string): MistNodeLike {
  return createSharedMistNode(nodeId)
}

export const networkClient = new ConsumerClient({
  createNode: createMistNode,
  nodeIdStorageKey: NODE_ID_STORAGE_KEY,
  requestTimeoutMs: 120_000,
  // ConsumerClient's own default (10s, see mistai's
  // DEFAULT_PROVIDER_WAIT_TIMEOUT_MS) is tuned for same-machine/dev testing;
  // a real cross-device LLM Network join (mistlib WebRTC peer discovery +
  // ICE negotiation over an actual LAN/WAN, especially the first connection
  // of a session) can take noticeably longer, and waitForEligibleProvider's
  // wait is already event-driven (resolves the instant a provider_hello
  // arrives, see mistai's resolveProviderWaiters) - so widening this ceiling
  // only delays the failure case, it never slows down a fast connection.
  // Bumped after a real-device report (tc-lingo, same family architecture)
  // of network TTS falling back to the browser voice that self-resolved
  // moments later on retry once the room finished connecting in the
  // background.
  providerWaitTimeoutMs: 30_000,
})

export type { ConsumerStatus, ConsumerStatusListener }

/** Subscribes to consumer connection status changes. Returns an unsubscribe function. */
export function onConsumerStatusChange(listener: ConsumerStatusListener): () => void {
  return networkClient.onStatusChange(listener)
}

/** Eagerly connects to the LLM Network room; errors surface via status, never thrown. */
export function connectNetworkConsumer(roomId: string): Promise<void> {
  return networkClient.connect(roomId)
}

/** Tears down the active/pending consumer session and resets status to idle. */
export function disconnectNetworkConsumer(): void {
  networkClient.disconnect()
}

/** Sends a chat request over the LLM Network room and resolves with the full reply text. */
export function requestNetworkChat(
  roomId: string,
  messages: ChatMessage[],
  model: string | undefined,
  onDelta?: (delta: string, full: string) => void,
): Promise<string> {
  return networkClient.requestChat(roomId, messages, { model, onDelta })
}

/** Requests speech synthesis over the LLM Network room; resolves with the audio Blob. */
export function requestNetworkTts(
  roomId: string,
  params: { text: string; model?: string; voice?: string },
): Promise<Blob> {
  return networkClient.requestTts(roomId, params)
}

/** Sends audio for transcription over the LLM Network room; resolves with the text. */
export function requestNetworkStt(
  roomId: string,
  params: { audio: Blob; model?: string; fileName?: string },
): Promise<string> {
  return networkClient.requestStt(roomId, params)
}

// Same node identity as networkClient: all stacks share the page's single
// MistNode (see createMistNode above), so the tunnel is just another handle
// on it - same peer id on the wire, own provider table and oai_* correlation.
export const oaiTunnelClient = new OaiTunnelClient({
  createNode: createMistNode,
  nodeIdStorageKey: NODE_ID_STORAGE_KEY,
})

/** Proxies an OpenAI-compatible request through an 'oai'-capable room provider; body/response are UTF-8 text. */
export function requestNetworkOpenAi(
  roomId: string,
  req: { path: string; method?: 'GET' | 'POST'; contentType?: string; body?: string },
): Promise<{ status: number; contentType: string; body: string }> {
  return oaiTunnelClient.request(roomId, req)
}

// ---------------------------------------------------------------------------
// Japanese localization rides the library's canonical MESSAGES_JA catalog so
// wording stays consistent with the other apps. This wrapper only pins the
// catalog choice; call sites keep the app-flavored name.

/**
 * User-facing Japanese message for any error coming out of a network (or
 * mixed network/API) code path. Non-MistaiError errors keep their own message.
 */
export function localizeNetworkError(err: unknown, fallback: string): string {
  return formatMistaiError(err, MESSAGES_JA, fallback)
}
