import { legacyDefaultSettings, settingsStorageKey, sttSettingsStorageKey, ttsSettingsStorageKey, voiceSettingsStorageKey } from '../constants'
import { emptyLlmConfig, ensureProvider, loadLlmConfig, saveLlmConfig, type ModelRefV1 } from './llmConfig'
import { isNetworkProviderBaseUrl, networkProviderBaseUrl } from './networkModels'
import type { LocalProviderSettings, ReasoningEffort, TaskModel } from '../types'

function readRaw(key: string): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {} } catch { return {} }
}

/** Import legacy data before removing it from new writes. Tasks mark completion locally. */
export function migrateLegacyLocalSettings(): void {
  const cfg = loadLlmConfig() ?? emptyLlmConfig()
  const local = readRaw(settingsStorageKey)
  let changed = false
  if (!cfg.defaultModel) {
    const preset = cfg.presets.find(p => p.id === cfg.defaultPresetId)
    if (preset) { cfg.defaultModel = { providerId: preset.providerId, model: preset.model }; changed = true }
  }
  if (typeof local.baseUrl === 'string' && local.baseUrl.trim() &&
    (local.baseUrl.replace(/\/+$/, '') !== legacyDefaultSettings.baseUrl || local.apiKey || local.model !== legacyDefaultSettings.model)) {
    const providerId = ensureProvider(cfg, { baseUrl: local.baseUrl, apiKey: local.apiKey ?? '' })
    if (!cfg.defaultModel) cfg.defaultModel = { providerId, model: local.model ?? '' }
    changed = true
  }
  const roomId = cfg.network.roomId.trim() || (typeof local.roomId === 'string' ? local.roomId.trim() : '')
  const providerCount = cfg.providers.length
  const roomProviderId = roomId ? cfg.providers.find(p => p.baseUrl === networkProviderBaseUrl(roomId))?.id ??
    ensureProvider(cfg, { label: roomId, baseUrl: networkProviderBaseUrl(roomId), apiKey: '' }) : ''
  if (cfg.providers.length !== providerCount) changed = true
  const presetRef = (id: unknown): ModelRefV1 | undefined => {
    const preset = cfg.presets.find(p => p.id === id)
    return preset ? { providerId: preset.providerId, model: preset.model } : undefined
  }
  if (!local.tasks) {
    const task = (id: unknown, effort: unknown): TaskModel => {
      const preset = cfg.presets.find(p => p.id === id)
      const value = effort ?? preset?.reasoningEffort ?? 'none'
      return { ref: presetRef(id), reasoningEffort: value as ReasoningEffort }
    }
    const next: LocalProviderSettings = {
      tasks: {
        default: { reasoningEffort: task(local.defaultPresetId || cfg.defaultPresetId, local.defaultReasoningEffort).reasoningEffort, ...(local.defaultPresetId ? { ref: presetRef(local.defaultPresetId) } : {}) },
        vision: task(local.visionPresetId, local.visionReasoningEffort),
      },
      roomProvide: roomProviderId ? { [roomProviderId]: {
        enabled: local.networkProviderEnabled === true,
        shared: (Array.isArray(local.networkProviderPresetIds) ? local.networkProviderPresetIds : []).map(presetRef).filter((r: ModelRefV1 | undefined): r is ModelRefV1 => !!r && cfg.providers.some(p => p.id === r.providerId && !isNetworkProviderBaseUrl(p.baseUrl))),
      } } : {},
      recentModels: [],
      performanceMode: local.performanceMode === 'fast' || local.performanceMode === 'saver' ? local.performanceMode : local.tokenSaver ? 'saver' : 'normal',
    }
    if (local.visionModel && local.baseUrl && local.visionModel !== local.model) {
      const providerId = ensureProvider(cfg, { baseUrl: local.baseUrl, apiKey: local.apiKey ?? '' })
      next.tasks.vision.ref = { providerId, model: local.visionModel }
    }
    localStorage.setItem(settingsStorageKey, JSON.stringify(next))
  }
  const combinedVoice = readRaw(voiceSettingsStorageKey)
  for (const kind of ['tts', 'stt'] as const) {
    const dedicated = readRaw(kind === 'tts' ? ttsSettingsStorageKey : sttSettingsStorageKey)
    const raw = typeof dedicated.baseUrl === 'string' ? dedicated : !cfg[kind] && typeof combinedVoice.baseUrl === 'string' ? { ...combinedVoice, model: kind === 'tts' ? combinedVoice.ttsModel : combinedVoice.sttModel, voice: combinedVoice.ttsVoice } : dedicated
    if (typeof raw.baseUrl !== 'string') continue
    if (!cfg[kind] && raw.model && raw.baseUrl.trim()) {
      const providerId = ensureProvider(cfg, { baseUrl: raw.baseUrl, apiKey: raw.apiKey ?? '' })
      cfg[kind] = { providerId, model: raw.model, ...(kind === 'tts' && raw.voice ? { voice: raw.voice } : {}) }
      changed = true
    }
    if (kind === 'stt') localStorage.setItem(sttSettingsStorageKey, JSON.stringify({ micDeviceId: raw.micDeviceId ?? '' }))
    else localStorage.removeItem(ttsSettingsStorageKey)
  }
  if (typeof combinedVoice.baseUrl === 'string') localStorage.removeItem(voiceSettingsStorageKey)
  // Seed the cache only on migration, so a live refresh is not overwritten
  // with retired preset models on the next page load.
  if (!local.tasks) {
    for (const preset of cfg.presets) {
      const provider = cfg.providers.find(p => p.id === preset.providerId)
      if (provider && !isNetworkProviderBaseUrl(provider.baseUrl) && preset.model) {
        const models = [...new Set([...(provider.models ?? []), preset.model])]
        if (models.length !== (provider.models ?? []).length) {
          provider.models = models
          changed = true
        }
      }
    }
  }
  // Legacy presets/defaultPresetId/network stay in the stored config for apps
  // that have not migrated yet, so only an actual change triggers a save.
  if (changed) saveLlmConfig(cfg)
}
