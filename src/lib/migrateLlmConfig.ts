// One-time migration of tc-translate's legacy per-key local settings
// (baseUrl/apiKey/model kept in `tc-translate-provider-settings-v1` /
// `-tts-settings-v1` / `-stt-settings-v1`) into the shared
// `tc-shared-llm-config-v1` key, following the merge-never-delete migration
// policy in protocol/docs/data-contracts/docs/llm-config.md:
//   1. load shared config (or start empty)
//   2. add legacy entries via ensureProvider/ensurePreset (append-only)
//   3. set defaultPresetId/tts/stt/network.roomId only if currently empty
//   4. saveLlmConfig
//
// Idempotent: legacy shape is detected by the presence of a `baseUrl` field
// (the new local shapes never have one), so once a key has been rewritten to
// its new shape, subsequent calls see nothing to migrate for it. A pristine,
// never-touched install (default OpenAI endpoint, no API key, default
// model/voice) is intentionally *not* seeded into the shared config - only
// settings the user actually changed are migrated.

import { normalizeBaseUrl } from './format'
import { emptyLlmConfig, ensureProvider, ensurePreset, loadLlmConfig, saveLlmConfig } from './llmConfig'
import {
  legacyDefaultSettings,
  legacyDefaultSttSettings,
  legacyDefaultTtsSettings,
  settingsStorageKey,
  sttSettingsStorageKey,
  ttsSettingsStorageKey,
  voiceSettingsStorageKey,
} from '../constants'
import type {
  LegacyProviderSettings,
  LegacySttSettings,
  LegacyTtsSettings,
  LegacyVoiceSettings,
  LocalProviderSettings,
  LocalSttSettings,
  LocalTtsSettings,
} from '../types'

function readRaw(key: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// The new local shapes (LocalProviderSettings/LocalTtsSettings/LocalSttSettings)
// never have a `baseUrl` field, so its presence marks the old (legacy) shape.
function hasBaseUrlField(raw: Record<string, unknown>): boolean {
  return typeof raw.baseUrl === 'string'
}

function readLegacyProviderSettings(raw: Record<string, unknown>): LegacyProviderSettings {
  return {
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : legacyDefaultSettings.baseUrl,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : legacyDefaultSettings.apiKey,
    model: typeof raw.model === 'string' ? raw.model : legacyDefaultSettings.model,
    visionModel: typeof raw.visionModel === 'string' ? raw.visionModel : legacyDefaultSettings.visionModel,
    temperature: typeof raw.temperature === 'number' ? raw.temperature : legacyDefaultSettings.temperature,
    connection: raw.connection === 'network' ? 'network' : 'api',
    roomId: typeof raw.roomId === 'string' ? raw.roomId : legacyDefaultSettings.roomId,
    networkProviderEnabled:
      typeof raw.networkProviderEnabled === 'boolean' ? raw.networkProviderEnabled : legacyDefaultSettings.networkProviderEnabled,
  }
}

function readLegacyCombinedVoiceSettings(): Partial<LegacyVoiceSettings> {
  const raw = readRaw(voiceSettingsStorageKey)
  return (raw ?? {}) as Partial<LegacyVoiceSettings>
}

function readLegacyTtsSettings(raw: Record<string, unknown> | null): LegacyTtsSettings {
  if (raw) {
    return {
      baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : legacyDefaultTtsSettings.baseUrl,
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : legacyDefaultTtsSettings.apiKey,
      model: typeof raw.model === 'string' ? raw.model : legacyDefaultTtsSettings.model,
      voice: typeof raw.voice === 'string' ? raw.voice : legacyDefaultTtsSettings.voice,
      engine: raw.engine === 'api' ? 'api' : raw.engine === 'network' ? 'network' : 'browser',
    }
  }
  // No dedicated TTS settings saved: fall back to the old combined key, same
  // as the pre-migration loadTtsSettings() did.
  const legacy = readLegacyCombinedVoiceSettings()
  return {
    baseUrl: legacy.baseUrl ?? legacyDefaultTtsSettings.baseUrl,
    apiKey: legacy.apiKey ?? legacyDefaultTtsSettings.apiKey,
    model: legacy.ttsModel ?? legacyDefaultTtsSettings.model,
    voice: legacy.ttsVoice ?? legacyDefaultTtsSettings.voice,
    engine: legacy.engine === 'api' ? 'api' : legacyDefaultTtsSettings.engine,
  }
}

function readLegacySttSettings(raw: Record<string, unknown> | null): LegacySttSettings {
  if (raw) {
    return {
      baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : legacyDefaultSttSettings.baseUrl,
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : legacyDefaultSttSettings.apiKey,
      model: typeof raw.model === 'string' ? raw.model : legacyDefaultSttSettings.model,
      engine: raw.engine === 'network' ? 'network' : 'api',
      micDeviceId: typeof raw.micDeviceId === 'string' ? raw.micDeviceId : legacyDefaultSttSettings.micDeviceId,
    }
  }
  const legacy = readLegacyCombinedVoiceSettings()
  return {
    baseUrl: legacy.baseUrl ?? legacyDefaultSttSettings.baseUrl,
    apiKey: legacy.apiKey ?? legacyDefaultSttSettings.apiKey,
    model: legacy.sttModel ?? legacyDefaultSttSettings.model,
    engine: legacyDefaultSttSettings.engine,
    micDeviceId: legacyDefaultSttSettings.micDeviceId,
  }
}

export function migrateLegacyLocalSettings(): void {
  const providerRaw = readRaw(settingsStorageKey)
  const ttsRaw = readRaw(ttsSettingsStorageKey)
  const sttRaw = readRaw(sttSettingsStorageKey)

  const providerIsLegacy = providerRaw !== null && hasBaseUrlField(providerRaw)
  const ttsIsLegacy = ttsRaw !== null && hasBaseUrlField(ttsRaw)
  const sttIsLegacy = sttRaw !== null && hasBaseUrlField(sttRaw)
  if (!providerIsLegacy && !ttsIsLegacy && !sttIsLegacy) return // nothing to migrate

  const cfg = loadLlmConfig() ?? emptyLlmConfig()
  let cfgChanged = false

  if (providerIsLegacy && providerRaw) {
    const legacy = readLegacyProviderSettings(providerRaw)
    let visionPresetId = ''

    // Don't seed api.openai.com with an empty key just because the user
    // opened the app: only migrate a provider/preset when something was
    // actually changed from the untouched defaults.
    const isPristine =
      !legacy.apiKey.trim() &&
      normalizeBaseUrl(legacy.baseUrl) === normalizeBaseUrl(legacyDefaultSettings.baseUrl) &&
      legacy.model.trim() === legacyDefaultSettings.model

    if (!isPristine) {
      const providerId = ensureProvider(cfg, { baseUrl: legacy.baseUrl, apiKey: legacy.apiKey })
      const presetId = ensurePreset(cfg, {
        label: legacy.model.trim() || 'デフォルト',
        providerId,
        model: legacy.model,
        temperature: legacy.temperature,
      })
      if (!cfg.defaultPresetId) cfg.defaultPresetId = presetId
      cfgChanged = true

      if (legacy.visionModel.trim() && legacy.visionModel.trim() !== legacy.model.trim()) {
        visionPresetId = ensurePreset(cfg, { label: 'Vision', providerId, model: legacy.visionModel })
      }
    }

    if (!cfg.network.roomId && legacy.roomId.trim()) {
      cfg.network.roomId = legacy.roomId.trim()
      cfgChanged = true
    }

    const newLocalProvider: LocalProviderSettings = {
      connection: legacy.connection,
      networkProviderEnabled: legacy.networkProviderEnabled,
      visionPresetId,
      // No legacy equivalent for these - simultaneous translation is new, so
      // both start unset and fall back to the default preset's model.
      orchestratorPresetId: '',
      workerPresetId: '',
    }
    localStorage.setItem(settingsStorageKey, JSON.stringify(newLocalProvider))
  }

  if (ttsIsLegacy) {
    const legacy = readLegacyTtsSettings(ttsRaw)
    const isPristine =
      !legacy.baseUrl.trim() &&
      !legacy.apiKey.trim() &&
      legacy.model.trim() === legacyDefaultTtsSettings.model &&
      legacy.voice.trim() === legacyDefaultTtsSettings.voice

    if (!cfg.tts && !isPristine) {
      if (legacy.baseUrl.trim()) {
        const providerId = ensureProvider(cfg, { baseUrl: legacy.baseUrl, apiKey: legacy.apiKey })
        cfg.tts = { providerId, model: legacy.model, voice: legacy.voice }
      } else if (legacy.model.trim()) {
        cfg.tts = { model: legacy.model, voice: legacy.voice }
      }
      if (cfg.tts) cfgChanged = true
    }

    const newLocalTts: LocalTtsSettings = { engine: legacy.engine }
    localStorage.setItem(ttsSettingsStorageKey, JSON.stringify(newLocalTts))
  }

  if (sttIsLegacy) {
    const legacy = readLegacySttSettings(sttRaw)
    const isPristine = !legacy.baseUrl.trim() && !legacy.apiKey.trim() && legacy.model.trim() === legacyDefaultSttSettings.model

    if (!cfg.stt && !isPristine) {
      if (legacy.baseUrl.trim()) {
        const providerId = ensureProvider(cfg, { baseUrl: legacy.baseUrl, apiKey: legacy.apiKey })
        cfg.stt = { providerId, model: legacy.model }
      } else if (legacy.model.trim()) {
        cfg.stt = { model: legacy.model }
      }
      if (cfg.stt) cfgChanged = true
    }

    const newLocalStt: LocalSttSettings = { engine: legacy.engine, micDeviceId: legacy.micDeviceId }
    localStorage.setItem(sttSettingsStorageKey, JSON.stringify(newLocalStt))
  }

  if (cfgChanged) saveLlmConfig(cfg)
}
