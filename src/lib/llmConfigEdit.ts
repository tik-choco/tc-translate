// Editing helpers for tc-translate's Settings UI: a plain CRUD layer over
// `config.providers`/`config.presets`, mirroring how tc-town's SettingsView
// manages the same shared config (add/update/delete acting directly on the
// array, not the append-only-dedup ensureProvider/ensurePreset used by the
// one-time legacy migration). The user explicitly manages a list of named
// connections and presets here, same as every other tik-choco app - so
// there's no need for tc-translate's own per-feature auto-creation magic.
// Callers are responsible for calling saveLlmConfig() afterwards (typically
// via `SharedLlmConfigState.save`, see hooks/useSharedLlmConfig.ts).

import type { LlmProviderV1, ModelPresetV1, SharedLlmConfigV1 } from './llmConfig'

function newId(): string {
  return crypto.randomUUID()
}

export function createProvider(config: SharedLlmConfigV1, label: string): string {
  const provider: LlmProviderV1 = { id: newId(), label, baseUrl: '', apiKey: '' }
  config.providers.push(provider)
  return provider.id
}

export function patchProvider(config: SharedLlmConfigV1, id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>): void {
  const provider = config.providers.find((entry) => entry.id === id)
  if (provider) Object.assign(provider, patch)
}

/** Removes a provider. Any preset still referencing it keeps its (now dangling) providerId - resolvePreset degrades that to "no target" rather than throwing. */
export function deleteProvider(config: SharedLlmConfigV1, id: string): void {
  config.providers = config.providers.filter((entry) => entry.id !== id)
}

export function createPreset(config: SharedLlmConfigV1, providerId: string, label: string): string {
  const preset: ModelPresetV1 = { id: newId(), label, providerId, model: '', temperature: 0.7 }
  config.presets.push(preset)
  // First preset ever created becomes the default automatically - otherwise
  // every role (default/vision) would keep resolving to nothing even though
  // a preset now exists.
  if (!config.defaultPresetId) config.defaultPresetId = preset.id
  return preset.id
}

export function patchPreset(config: SharedLlmConfigV1, id: string, patch: Partial<Omit<ModelPresetV1, 'id'>>): void {
  const preset = config.presets.find((entry) => entry.id === id)
  if (preset) Object.assign(preset, patch)
}

/** Removes a preset. If it was the default, the next remaining preset (if any) takes over; the vision pointer referencing it is left to the caller to clear (see useProviderSettings). */
export function deletePreset(config: SharedLlmConfigV1, id: string): void {
  config.presets = config.presets.filter((entry) => entry.id !== id)
  if (config.defaultPresetId === id) config.defaultPresetId = config.presets[0]?.id ?? ''
}

/** Updates `config.tts`/`config.stt` in place from Settings UI edits. An empty `providerId` clears it (falls back to the default preset's provider). */
export function setVoiceConfig(
  config: SharedLlmConfigV1,
  kind: 'tts' | 'stt',
  next: { providerId?: string; model: string; voice?: string },
): void {
  config[kind] = {
    ...(next.providerId ? { providerId: next.providerId } : {}),
    model: next.model,
    ...(next.voice ? { voice: next.voice } : {}),
  }
}
