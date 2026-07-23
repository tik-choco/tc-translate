// mistlib-wasm supports exactly ONE active MistNode per page (a module-level
// `activeNode` guard plus one global event callback in the vendored wrapper),
// but that single node is multi-room: joinRoom(roomId) can be called for any
// number of rooms and every event carries the roomId it happened in. The app,
// however, has up to three independent "network stacks" alive at once - the
// LLM consumer (ConsumerClient), the provider hook (useMistaiProvider), and
// the OAI tunnel client - each constructing its own mistai `Network`, which
// in turn creates and init()s its own MistNode. The second of those used to
// throw "mistlib-wasm supports one active MistNode per page".
//
// This module fixes that by multiplexing every createMistNode() caller onto
// one real MistNode behind lightweight per-caller handles:
// - init() lazily creates/inits the single real node (first caller's nodeId
//   wins; all app callers derive theirs from the same storage key anyway).
// - Events fan out to every live handle, filtered by the rooms that handle
//   actually joined (the wrapper's 4th onEvent arg; events without a roomId,
//   if any, are delivered to all handles).
// - leaveRoom() releases only this handle's room memberships, reference
//   counted across handles, so e.g. the consumer disconnecting doesn't kick
//   the provider out of the room they share. The real node itself stays
//   initialized for the page's lifetime - re-creating it later would just
//   re-trip the wrapper's singleton guard for no benefit.
//
// Consequence of the shared identity: all three stacks are one peer on the
// wire (same nodeId). In particular, a page's own provider can no longer be
// "discovered" by that same page's consumer (mist doesn't loop broadcasts
// back to the sender) - which was only ever a degenerate loopback anyway.

import type { MistNodeLike } from '@tik-choco/mistai'
import { MistNode } from '../vendor/mistlib/wrappers/web/index.js'

let realNode: MistNode | null = null
let realNodeId: string | null = null
const liveHandles = new Set<SharedMistNodeHandle>()
const roomRefCounts = new Map<string, number>()

function ensureRealNode(nodeId: string): MistNode {
  if (!realNode) {
    realNode = new MistNode(nodeId)
    realNodeId = nodeId
    realNode.onEvent((eventType, fromId, payload, roomId) => {
      // Copy: a handler may add/remove handles (e.g. reconnect) mid-dispatch.
      for (const handle of [...liveHandles]) handle.dispatch(eventType, fromId, payload, roomId)
    })
  } else if (realNodeId !== nodeId) {
    // All app callers derive their id from the same storage key, so this only
    // fires if a new caller passes a divergent id - it still shares the page
    // identity (the wire nodeId is fixed at first init).
    console.warn(`tc-translate: shared MistNode already initialized as ${realNodeId}; ignoring requested id ${nodeId}`)
  }
  return realNode
}

class SharedMistNodeHandle implements MistNodeLike {
  private readonly nodeId: string
  private readonly rooms = new Set<string>()
  private handler: ((eventType: number, fromId: string, payload: unknown) => void) | null = null

  constructor(nodeId: string) {
    this.nodeId = nodeId
  }

  async init(): Promise<void> {
    await ensureRealNode(this.nodeId).init()
    liveHandles.add(this)
  }

  onEvent(handler: (eventType: number, fromId: string, payload: unknown) => void): void {
    this.handler = handler
  }

  joinRoom(roomId: string): void {
    if (!this.rooms.has(roomId)) {
      this.rooms.add(roomId)
      roomRefCounts.set(roomId, (roomRefCounts.get(roomId) ?? 0) + 1)
    }
    // Re-joining an already-joined room is an idempotent re-announce per the
    // wrapper, so no need to guard the underlying call.
    realNode?.joinRoom(roomId)
  }

  leaveRoom(): void {
    for (const roomId of this.rooms) {
      const remaining = (roomRefCounts.get(roomId) ?? 1) - 1
      if (remaining <= 0) {
        roomRefCounts.delete(roomId)
        // Per-room leave (mist_leave_room_id) - unlike the argless wrapper
        // leaveRoom(), this does NOT reset the wrapper's activeNode guard, so
        // the shared node stays usable for the other handles and for later
        // re-joins.
        realNode?.leaveRoom(roomId)
      } else {
        roomRefCounts.set(roomId, remaining)
      }
    }
    this.rooms.clear()
    liveHandles.delete(this)
  }

  sendMessage(toId: string | null | undefined, payload: Uint8Array, delivery?: number): void {
    realNode?.sendMessage(toId, payload, delivery)
  }

  /** Fan-out target for the real node's single global event callback. */
  dispatch(eventType: number, fromId: string, payload: unknown, roomId: string): void {
    if (!this.handler) return
    // Room-scoped events only reach handles that joined that room; events
    // without a room tag (defensive - the wrapper always passes one today)
    // are delivered to everyone.
    if (typeof roomId === 'string' && roomId && !this.rooms.has(roomId)) return
    this.handler(eventType, fromId, payload)
  }
}

/**
 * Drop-in `createNode` factory for mistai's Network: returns a handle onto
 * the page's single shared MistNode instead of a fresh (and, for every caller
 * but the first, fatally colliding) real node.
 */
export function createSharedMistNode(nodeId: string): MistNodeLike {
  return new SharedMistNodeHandle(nodeId)
}

/**
 * For callers that only need the shared node's storage_add/storage_get
 * (mistStorage.ts) - no rooms, no events - and so don't need a full
 * SharedMistNodeHandle. Routes through the same `ensureRealNode`/`init()`
 * guards as every other caller so `init_with_config` still only ever runs
 * once per page, no matter which caller (storage vs. LLM Network consumer vs.
 * provider) happens to be first.
 */
export async function ensureSharedMistNodeReady(nodeId: string): Promise<void> {
  await ensureRealNode(nodeId).init()
}
