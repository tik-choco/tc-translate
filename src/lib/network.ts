import { ConsumerClient, MESSAGES_JA, formatMistaiError, type ConsumerStatus, type ConsumerStatusListener, type ChatMessage, type MistNodeLike } from '@tik-choco/mistai'
import { createSharedMistNode } from './mistNodeShared'
import { OaiTunnelClient } from './p2p/tunnel'
import { cacheRoomModels } from './providerModels'
export const NODE_ID_STORAGE_KEY = 'tc-translate-mistllm-node-id-v1'
export function createMistNode(nodeId: string, roomId?: string): MistNodeLike { return createSharedMistNode(nodeId, roomId) }
export type { ConsumerStatus, ConsumerStatusListener }
const consumers = new Map<string, ConsumerClient>()
const tunnels = new Map<string, OaiTunnelClient>()
export function roomConsumer(roomId: string): ConsumerClient {
  const room = roomId.trim()
  let client = consumers.get(room)
  if (!client) {
    client = new ConsumerClient({ createNode: nodeId => createMistNode(nodeId, room), nodeIdStorageKey: NODE_ID_STORAGE_KEY, requestTimeoutMs: 120_000, providerWaitTimeoutMs: 30_000 })
    consumers.set(room, client)
    client.onStatusChange(status => { if (status.phase === 'connected') cacheRoomModels(room, status.models ?? []) })
  }
  return client
}
export function disconnectRoom(roomId: string) {
  consumers.get(roomId)?.disconnect()
  tunnels.get(roomId)?.disconnect()
}
export function requestNetworkChat(roomId: string, messages: ChatMessage[], model: string | undefined, onDelta?: (delta: string, full: string) => void): Promise<string> {
  return roomConsumer(roomId).requestChat(roomId, messages, { model, onDelta })
}
export function requestNetworkTts(roomId: string, params: { text: string; model?: string; voice?: string }): Promise<Blob> {
  return roomConsumer(roomId).requestTts(roomId, params)
}
export function requestNetworkStt(roomId: string, params: { audio: Blob; model?: string; fileName?: string }): Promise<string> {
  return roomConsumer(roomId).requestStt(roomId, params)
}
export function requestNetworkOpenAi(roomId: string, req: { path: string; method?: 'GET' | 'POST'; contentType?: string; body?: string }) {
  let client = tunnels.get(roomId)
  if (!client) { client = new OaiTunnelClient({ createNode: nodeId => createMistNode(nodeId, roomId), nodeIdStorageKey: NODE_ID_STORAGE_KEY }); tunnels.set(roomId, client) }
  return client.request(roomId, req)
}
export function localizeNetworkError(err: unknown, fallback: string): string { return formatMistaiError(err, MESSAGES_JA, fallback) }
