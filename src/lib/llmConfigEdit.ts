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
import { isNetworkProviderBaseUrl } from './networkModels'

function newId(): string {
  return crypto.randomUUID()
}

/**
 * Picks a safe replacement for `config.defaultPresetId` once its previous
 * target preset has just been removed - the first preset that is NOT sitting
 * under any `mist-network://` mirror provider (this room's or any other
 * room's), never an arbitrary `config.presets[0]`.
 *
 * Why this matters: `resolvePreset(config)` (lib/llmConfig.ts) is the
 * fallback target for ANY task (chat, and TTS/STT too) whose own
 * `providerId` is left unset - the documented, legitimate way to configure
 * them. Blindly reusing `config.presets[0]` here would silently promote
 * whatever preset happens to be array-first - very plausibly a network
 * mirror preset (see useNetworkModelSync.ts) - to "the default", flipping
 * every unset-providerId task from the user's actual API provider onto the
 * AI Network transport with no user action at all. Falls back to "" (unset)
 * when every remaining preset happens to be network-owned, rather than
 * picking one anyway.
 */
function safeDefaultPresetFallback(config: SharedLlmConfigV1): string {
  const nonNetwork = config.presets.find((p) => {
    const provider = config.providers.find((pr) => pr.id === p.providerId)
    return provider !== undefined && !isNetworkProviderBaseUrl(provider.baseUrl)
  })
  return nonNetwork?.id ?? ''
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
  if (config.defaultPresetId === id) config.defaultPresetId = safeDefaultPresetFallback(config)
}

/**
 * Updates `config.tts`/`config.stt` in place from Settings UI edits. An empty
 * `providerId` clears it (falls back to the default preset's provider); an
 * empty/absent `voice` omits it the same way. Fields this function doesn't
 * know about (currently just `speed`) are preserved from the existing value
 * rather than dropped - `next` only carries what the voice-row UI actually
 * edits, and another app may have set `speed` independently in this same
 * shared-localStorage record, so a plain `config[kind] = next` here would
 * silently discard it on every edit (mirrors mistai's llm-config.ts fix).
 */
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
