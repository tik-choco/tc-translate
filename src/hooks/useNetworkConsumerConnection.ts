import { useEffect, useRef } from 'preact/hooks'
import { disconnectRoom, roomConsumer } from '../lib/network'
import { isNetworkProviderBaseUrl, roomIdFromBaseUrl } from '../lib/networkModels'
import type { ProviderSettings } from '../types'
import type { SharedLlmConfigState } from './useSharedLlmConfig'

export function useNetworkConsumerConnection(settings: ProviderSettings, state: SharedLlmConfigState, browsing: boolean): void {
  const refs = [settings.defaultModel, ...Object.values(settings.tasks).map(t => t.ref), state.config.tts, state.config.stt]
  const rooms = settings.providers.filter(p => p.enabled !== false && isNetworkProviderBaseUrl(p.baseUrl) &&
    (browsing || settings.roomProvide[p.id]?.enabled || refs.some(ref => ref?.providerId === p.id)))
  const roomIds = [...new Set(rooms.map(p => roomIdFromBaseUrl(p.baseUrl)))]
  const key = roomIds.sort().join('|')
  const joined = useRef(new Map<string, () => void>())
  useEffect(() => {
    const desired = new Set(roomIds)
    for (const [id, stop] of joined.current) {
      if (!desired.has(id)) { stop(); joined.current.delete(id) }
    }
    roomIds.forEach(room => {
      if (joined.current.has(room)) return
      const client = roomConsumer(room)
      void client.connect(room)
      joined.current.set(room, () => disconnectRoom(room))
    })
  }, [key])
  useEffect(() => () => { joined.current.forEach(stop => stop()); joined.current.clear() }, [])
}
