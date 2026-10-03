import type { LlmProviderV1, SharedLlmConfigV1 } from './llmConfig'

export function createProvider(config: SharedLlmConfigV1, label: string): string {
  const id = crypto.randomUUID()
  config.providers.push({ id, label, baseUrl: '', apiKey: '', enabled: true, models: [] })
  return id
}
export function patchProvider(config: SharedLlmConfigV1, id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>): void {
  const provider = config.providers.find(p => p.id === id)
  if (provider) Object.assign(provider, patch)
}
export function deleteProvider(config: SharedLlmConfigV1, id: string): void {
  config.providers = config.providers.filter(p => p.id !== id)
}

export function setVoiceConfig(
  config: SharedLlmConfigV1,
  kind: 'tts' | 'stt',
  next: { providerId?: string; model: string; voice?: string },
): void {
  const previous = config[kind]
  config[kind] = {
    ...(previous?.speed !== undefined ? { speed: previous.speed } : {}),
    ...(next.providerId ? { providerId: next.providerId } : {}),
    model: next.model,
    ...(next.voice ? { voice: next.voice } : {}),
  }
}
