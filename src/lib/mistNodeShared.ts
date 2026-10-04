import { createSharedNodeScope } from '@tik-choco/mistai'
import { MistNode } from '../vendor/mistlib/wrappers/web/index.js'
import { captureMistBuildInfo, markMistLoadError } from './mistBuildInfo'
import { mistSignalingConfig } from './mistSignaling'

export const createSharedMistNode = createSharedNodeScope(nodeId => {
  const node = new MistNode(nodeId, mistSignalingConfig())
  const init = node.init.bind(node)
  node.init = async () => {
    try { await init(); captureMistBuildInfo() }
    catch (error) { markMistLoadError(); throw error }
  }
  return node
})

// Storage uses the same node identity and initialization as AI rooms.
export async function ensureSharedMistNodeReady(nodeId: string): Promise<void> {
  const handle = createSharedMistNode(nodeId)
  await handle.init()
  handle.leaveRoom()
}
