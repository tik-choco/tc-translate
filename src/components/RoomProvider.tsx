import { useEffect, useState } from 'preact/hooks'
import { useNetworkProvider } from '../hooks/useNetworkProvider'
import type { SharedLlmConfigV1 } from '../lib/llmConfig'
import { isNetworkProviderBaseUrl } from '../lib/networkModels'
import type { ProviderSettings, SttSettings, TtsSettings } from '../types'
const results = new Map<string, ReturnType<typeof useNetworkProvider>>()
const listeners = new Set<() => void>()
type Props = { settings: ProviderSettings; ttsSettings: TtsSettings; sttSettings: SttSettings; config: SharedLlmConfigV1 }
function RoomProvider({ id, ...props }: Props & { id: string }) {
  const result = useNetworkProvider(props.settings, props.ttsSettings, props.sttSettings, props.config, id, props.settings.roomProvide[id] ?? { enabled: false, shared: [] })
  useEffect(() => {
    results.set(id, result)
    listeners.forEach(fn => fn())
  }, [id, result.status, result.statusUpdatedAt, result.peers, result.logs, result.errorMessage, result.upstreamConfigured])
  useEffect(() => () => { results.delete(id); listeners.forEach(fn => fn()) }, [id])
  return null
}
export function RoomProviders(props: Props) {
  return <>{props.settings.providers.filter(p => isNetworkProviderBaseUrl(p.baseUrl)).map(p => <RoomProvider key={p.id} id={p.id} {...props} />)}</>
}
export function useRoomProviderResult(id: string) {
  const [, update] = useState(0)
  useEffect(() => { const fn = () => update(n => n + 1); listeners.add(fn); return () => { listeners.delete(fn) } }, [])
  return results.get(id)
}
