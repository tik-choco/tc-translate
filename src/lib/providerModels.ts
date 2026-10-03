import { fetchModelIds } from './api'
import { loadLlmConfig, saveLlmConfig, type LlmProviderV1 } from './llmConfig'
import { roomConsumer } from './network'
import { isNetworkProviderBaseUrl, roomIdFromBaseUrl } from './networkModels'

export const MODEL_CACHE_EVENT = 'tc-translate-model-cache'
export type ModelFetchStatus = { phase: 'fetching' | 'ok' | 'error'; error?: string }
const statuses = new Map<string, { connection: string; status: ModelFetchStatus }>()
const inFlight = new Map<string, { connection: string; promise: Promise<void> }>()
const listeners = new Set<() => void>()
const connectionKey = (provider: LlmProviderV1) => JSON.stringify([provider.baseUrl, provider.apiKey, provider.enabled !== false])

export function modelFetchStatus(provider: LlmProviderV1): ModelFetchStatus | undefined {
  const entry = statuses.get(provider.id)
  return entry?.connection === connectionKey(provider) ? entry.status : undefined
}
export function subscribeModelFetchStatus(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function setStatus(provider: LlmProviderV1, status: ModelFetchStatus) {
  statuses.set(provider.id, { connection: connectionKey(provider), status })
  listeners.forEach(listener => listener())
}
function currentProvider(provider: LlmProviderV1) {
  const current = loadLlmConfig()?.providers.find(p => p.id === provider.id)
  return current && current.enabled !== false && connectionKey(current) === connectionKey(provider) ? current : undefined
}
export function cacheRoomModels(room: string, models: string[]) {
  const config = loadLlmConfig()
  const providers = config?.providers.filter(p => p.enabled !== false && isNetworkProviderBaseUrl(p.baseUrl) && roomIdFromBaseUrl(p.baseUrl) === room) ?? []
  if (!config || !providers.length) return
  const timestamp = new Date().toISOString()
  for (const provider of providers) {
    provider.models = [...new Set([...models, ...(provider.models ?? [])])]
    provider.modelsFetchedAt = timestamp
    setStatus(provider, { phase: 'ok' })
  }
  saveLlmConfig(config)
  window.dispatchEvent(new Event(MODEL_CACHE_EVENT))
}

// Opening any list shares the same request and success throttle. Connection
// edits bypass the throttle; results from superseded connections are ignored.
export function refreshProviderModels(id: string, force = false): Promise<void> {
  const provider = loadLlmConfig()?.providers.find(p => p.id === id)
  if (!provider || provider.enabled === false) return Promise.resolve()
  const connection = connectionKey(provider)
  const pending = inFlight.get(id)
  if (pending) {
    if (pending.connection === connection) return pending.promise
    return pending.promise.then(() => refreshProviderModels(id, true))
  }
  const fetchedAt = Date.parse(provider.modelsFetchedAt ?? '')
  if (!force && Date.now() - fetchedAt < 10_000) return Promise.resolve()
  setStatus(provider, { phase: 'fetching' })
  const promise = (async () => {
    try {
      let models: string[]
      if (isNetworkProviderBaseUrl(provider.baseUrl)) {
        const room = roomIdFromBaseUrl(provider.baseUrl)
        const client = roomConsumer(room)
        await client.connect(room)
        const status = client.status
        if (status.phase === 'error') throw new Error(status.message)
        if (status.phase === 'idle') return
        models = [...new Set([...(status.phase === 'connected' ? status.models ?? [] : []), ...(currentProvider(provider)?.models ?? [])])]
      } else {
        models = await fetchModelIds(provider, AbortSignal.timeout(15_000))
      }
      if (!currentProvider(provider)) return
      const config = loadLlmConfig()!
      const current = config.providers.find(p => p.id === id)!
      current.models = models
      current.modelsFetchedAt = new Date().toISOString()
      saveLlmConfig(config)
      window.dispatchEvent(new Event(MODEL_CACHE_EVENT))
      setStatus(current, { phase: 'ok' })
    } catch (error) {
      if (currentProvider(provider)) setStatus(provider, { phase: 'error', error: error instanceof Error ? error.message : String(error) })
    } finally {
      inFlight.delete(id)
    }
  })()
  inFlight.set(id, { connection, promise })
  return promise
}
export function revalidateProviderModels(): Promise<void> {
  return Promise.all((loadLlmConfig()?.providers ?? []).filter(p => p.enabled !== false).map(p => refreshProviderModels(p.id))).then(() => {})
}
