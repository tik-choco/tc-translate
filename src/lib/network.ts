import { createRoomConsumers, formatMistaiError, MESSAGES_JA } from '@tik-choco/mistai'
import { createSharedMistNode } from './mistNodeShared'

export const NODE_ID_STORAGE_KEY = 'tc-translate-mistllm-node-id-v1'
export const rooms = createRoomConsumers(createSharedMistNode, {
  nodeIdStorageKey: NODE_ID_STORAGE_KEY, requestTimeoutMs: 120_000, providerWaitTimeoutMs: 30_000,
})
export const { roomConsumer, disconnectRoom, requestRoomChat: requestNetworkChat,
  requestRoomTts: requestNetworkTts, requestRoomStt: requestNetworkStt,
  requestRoomOpenAi: requestNetworkOpenAi } = rooms
export type { ConsumerStatus, ConsumerStatusListener } from '@tik-choco/mistai'

export function localizeNetworkError(err: unknown, fallback: string): string { return formatMistaiError(err, MESSAGES_JA, fallback) }
