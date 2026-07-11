// Editing helpers for tc-translate's Settings UI: unlike ensureProvider/
// ensurePreset (append-only, used by the one-time migration), these mutate an
// *existing* provider/preset in place so typing into the API tab updates the
// same shared-config entry instead of appending a new one on every keystroke.
// Callers are responsible for calling saveLlmConfig() afterwards.

import { ensureProvider, ensurePreset, type SharedLlmConfigV1 } from './llmConfig'

/**
 * Finds tc-translate's default preset/provider pair, creating one (and
 * setting it as `defaultPresetId`) if none exists yet - so the first edit in
 * a fresh Settings modal has somewhere to write to. `seed` fills the newly
 * created entry's fields the caller isn't itself about to overwrite (e.g.
 * typing Base URL first shouldn't leave `model` blank): callers pass the
 * full currently-displayed settings so a from-scratch preset starts with the
 * same pre-filled values the UI was already showing, matching the
 * pre-migration merged-defaults UX. Ignored when reusing an existing entry.
 */
export function ensureDefaultTarget(
  config: SharedLlmConfigV1,
  seed?: { baseUrl: string; apiKey: string; model: string; temperature: number },
): { providerId: string; presetId: string } {
  const existing = config.presets.find((preset) => preset.id === config.defaultPresetId)
  if (existing) return { providerId: existing.providerId, presetId: existing.id }

  const providerId = ensureProvider(config, { baseUrl: seed?.baseUrl ?? '', apiKey: seed?.apiKey ?? '' })
  const presetId = ensurePreset(config, {
    providerId,
    model: seed?.model ?? '',
    ...(seed?.temperature !== undefined ? { temperature: seed.temperature } : {}),
  })
  config.defaultPresetId = presetId
  return { providerId, presetId }
}

export function setDefaultProviderConnection(config: SharedLlmConfigV1, baseUrl: string, apiKey: string): void {
  const { providerId } = ensureDefaultTarget(config)
  const provider = config.providers.find((entry) => entry.id === providerId)
  if (!provider) return
  provider.baseUrl = baseUrl
  provider.apiKey = apiKey
}

export function setDefaultPresetModel(config: SharedLlmConfigV1, model: string): void {
  const { presetId } = ensureDefaultTarget(config)
  const preset = config.presets.find((entry) => entry.id === presetId)
  if (preset) preset.model = model
}

export function setDefaultPresetTemperature(config: SharedLlmConfigV1, temperature: number): void {
  const { presetId } = ensureDefaultTarget(config)
  const preset = config.presets.find((entry) => entry.id === presetId)
  if (preset) preset.temperature = temperature
}

/**
 * Creates/updates the vision preset referenced by `visionPresetId`, or clears
 * it (returns '') when `visionModel` is blank or matches the default
 * preset's model - both cases just fall back to the default preset via
 * resolvePreset's own empty-id handling, so no separate preset is needed.
 */
export function setVisionPreset(
  config: SharedLlmConfigV1,
  visionPresetId: string,
  visionModel: string,
  defaultModel: string,
): string {
  const trimmed = visionModel.trim()
  if (!trimmed || trimmed === defaultModel.trim()) return ''

  const existing = visionPresetId ? config.presets.find((preset) => preset.id === visionPresetId) : undefined
  if (existing) {
    existing.model = trimmed
    return existing.id
  }

  const { providerId } = ensureDefaultTarget(config)
  return ensurePreset(config, { label: 'Vision', providerId, model: trimmed })
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
