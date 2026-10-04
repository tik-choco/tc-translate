import { createProvider, normalizeBaseUrl, patchProvider, type SharedLlmConfigV1 } from '@tik-choco/mistai/llm-config'

// Onboarding and pre-shared-config imports reuse an existing connection.
export function ensureProvider(config: SharedLlmConfigV1, input: { label?: string; baseUrl: string; apiKey: string }): string {
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const existing = config.providers.find(p => normalizeBaseUrl(p.baseUrl) === baseUrl && p.apiKey === input.apiKey)
  if (existing) return existing.id
  const id = createProvider(config, input.label || baseUrl)
  patchProvider(config, id, { baseUrl, apiKey: input.apiKey })
  return id
}
