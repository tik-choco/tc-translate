import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { Network } from '@tik-choco/mistai'
import {
  EVENT_AOI_ENTERED,
  EVENT_AOI_LEFT,
  EVENT_PEER_CONNECTED,
  EVENT_PEER_DISCONNECTED,
} from '@tik-choco/mistlib-web'

class TestMistNode {
  static instance
  constructor() { TestMistNode.instance = this }
  async init() {}
  onEvent(handler) { this.handler = handler }
  joinRoom(roomId) { this.roomId = roomId }
  leaveRoom(roomId) { this.leftRoom = roomId }
  sendMessage() {}
}
globalThis.__sharedNodeTestMistNode = TestMistNode
const diagnosticsUrl = new URL('../src/lib/mistBuildInfo.ts', import.meta.url).href
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@tik-choco/mistlib-web' && context.parentURL?.includes('/src/')) {
      return { url: 'test-mist-node:wrapper', shortCircuit: true }
    }
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/i.test(specifier)) {
      specifier += '.ts'
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url === 'test-mist-node:wrapper') return { format: 'module', shortCircuit: true,
      source: 'export const MistNode = globalThis.__sharedNodeTestMistNode;' }
    if (url === diagnosticsUrl) return { format: 'module', shortCircuit: true,
      source: 'export function captureMistBuildInfo() {} export function markMistLoadError() {}' }
    return next(url, context)
  },
})
const { createSharedMistNode } = await import('../src/lib/mistNodeShared.ts')
hooks.deregister()

test('shared node routes peer events for its room and ignores AOI events', async () => {
  const received = []
  const network = new Network({
    nodeId: 'local',
    createNode: createSharedMistNode,
    callbacks: {
      onPeerConnected: id => received.push(['connected', id]),
      onPeerDisconnected: id => received.push(['disconnected', id]),
    },
  })
  await network.join('room')
  const node = TestMistNode.instance
  assert.equal(node.roomId, 'room')
  const bytes = text => new TextEncoder().encode(text)
  node.handler(EVENT_PEER_CONNECTED, 'peer', bytes('joined'), 'room')
  node.handler(EVENT_AOI_ENTERED, 'other', bytes('entered'), 'room')
  node.handler(EVENT_AOI_LEFT, 'other', bytes('left'), 'room')
  node.handler(EVENT_PEER_CONNECTED, 'other-room-peer', bytes('joined'), 'other-room')
  node.handler(EVENT_PEER_DISCONNECTED, 'peer', bytes('left'), 'room')
  assert.deepEqual(received, [['connected', 'peer'], ['disconnected', 'peer']])
  network.destroy()
  assert.equal(node.leftRoom, 'room')
})
