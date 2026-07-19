import { useEffect, useMemo, useState } from 'preact/hooks'
import { defaultResolvedProvider, fallbackModelOptions } from '../constants'
import { fetchModelIds } from '../lib/api'
import { normalizeBaseUrl } from '../lib/format'
import { createPreset, createProvider, deletePreset, deleteProvider, patchPreset, patchProvider } from '../lib/llmConfigEdit'
import { resolvePreset } from '../lib/llmConfig'
import { isNetworkProviderBaseUrl } from '../lib/networkModels'
import { loadSettings, saveSettings } from '../lib/storage'
import type { SharedLlmConfigState } from './useSharedLlmConfig'
import type { LlmProviderV1, ModelPresetV1 } from '../lib/llmConfig'
import type { LocalProviderSettings, ModelStatus, ProviderSettings, ReasoningEffort, ReasoningTask } from '../types'

function mergeSettings(local: LocalProviderSettings, llmConfigState: SharedLlmConfigState): ProviderSettings {
  const config = llmConfigState.config
  const resolved = resolvePreset(config)
  const visionResolved = resolvePreset(config, local.visionPresetId)

  return {
    baseUrl: resolved?.baseUrl ?? defaultResolvedProvider.baseUrl,
    apiKey: resolved?.apiKey ?? defaultResolvedProvider.apiKey,
    model: resolved?.model ?? defaultResolvedProvider.model,
    visionModel: visionResolved?.model ?? resolved?.model ?? defaultResolvedProvider.visionModel,
    temperature: resolved?.temperature ?? defaultResolvedProvider.temperature,
    reasoningEffort: local.defaultReasoningEffort,
    visionReasoningEffort: local.visionReasoningEffort,
    connection: local.connection,
    roomId: config.network.roomId,
    networkProviderEnabled: local.networkProviderEnabled,
    visionPresetId: local.visionPresetId,
    networkProviderPresetIds: local.networkProviderPresetIds,
    providers: config.providers,
    presets: config.presets,
    defaultPresetId: config.defaultPresetId,
  }
}

export function useProviderSettings(llmConfigState: SharedLlmConfigState) {
  const [local, setLocal] = useState<LocalProviderSettings>(() => loadSettings())
  const settings = useMemo(() => mergeSettings(local, llmConfigState), [local, llmConfigState.config])

  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelError, setModelError] = useState('')

  // Suggestions offered (via <datalist>) when typing a preset's model name -
  // fetched against the default preset's connection, since that's the one
  // most likely to be actively edited. Presets on other connections can
  // still type any model name freely; this is a convenience, not a source of
  // truth.
  const selectableModelOptions = useMemo(() => {
    const options = modelOptions.length ? modelOptions : fallbackModelOptions
    return [...new Set([settings.model, ...options].filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    )
  }, [modelOptions, settings.model])

  // connection/networkProviderEnabled/roomId are the only fields still edited
  // through the merged settings object - baseUrl/apiKey/model/temperature and
  // vision now go through the provider/preset CRUD below, which edits the
  // shared config's `providers`/`presets` arrays directly.
  function updateSettings(next: ProviderSettings): void {
    if (next.connection !== settings.connection || next.networkProviderEnabled !== settings.networkProviderEnabled) {
      const nextLocal: LocalProviderSettings = {
        ...local,
        connection: next.connection,
        networkProviderEnabled: next.networkProviderEnabled,
      }
      setLocal(nextLocal)
      saveSettings(nextLocal)
    }

    if (next.roomId !== settings.roomId) {
      llmConfigState.save((config) => {
        config.network.roomId = next.roomId
      })
    }
  }

  function addProvider(label: string, patch?: Partial<Omit<LlmProviderV1, 'id'>>): void {
    llmConfigState.save((config) => {
      const id = createProvider(config, label)
      if (patch) patchProvider(config, id, patch)
    })
  }

  function updateProvider(id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>): void {
    llmConfigState.save((config) => {
      patchProvider(config, id, patch)
    })
  }

  function removeProvider(id: string): void {
    llmConfigState.save((config) => {
      deleteProvider(config, id)
    })
  }

  function addPreset(providerId: string, label: string, patch?: Partial<Omit<ModelPresetV1, 'id'>>): void {
    llmConfigState.save((config) => {
      const id = createPreset(config, providerId, label)
      if (patch) patchPreset(config, id, patch)
    })
  }

  function updatePreset(id: string, patch: Partial<Omit<ModelPresetV1, 'id'>>): void {
    llmConfigState.save((config) => {
      patchPreset(config, id, patch)
    })
  }

  function removePreset(id: string): void {
    llmConfigState.save((config) => {
      deletePreset(config, id)
    })
  }

  function setDefaultPresetId(id: string): void {
    llmConfigState.save((config) => {
      config.defaultPresetId = id
    })
  }

  function setVisionPresetId(id: string): void {
    const nextLocal: LocalProviderSettings = { ...local, visionPresetId: id }
    setLocal(nextLocal)
    saveSettings(nextLocal)
  }

  function setNetworkProviderPresetIds(ids: string[]): void {
    const nextLocal: LocalProviderSettings = { ...local, networkProviderPresetIds: ids }
    setLocal(nextLocal)
    saveSettings(nextLocal)
  }

  function setReasoningEffort(task: ReasoningTask, effort: ReasoningEffort): void {
    const key = task === 'default' ? 'defaultReasoningEffort' : 'visionReasoningEffort'
    const nextLocal: LocalProviderSettings = { ...local, [key]: effort }
    setLocal(nextLocal)
    saveSettings(nextLocal)
  }

  async function loadModels(signal?: AbortSignal): Promise<void> {
    // The default preset can now resolve to a network-imported preset (see
    // useNetworkModelSync) whose baseUrl is the `mist-network://` pseudo-
    // provider scheme, not an HTTP endpoint - skip the fetch for those the
    // same way the 'network' connection mode is skipped.
    if (settings.connection === 'network' || isNetworkProviderBaseUrl(settings.baseUrl) || !normalizeBaseUrl(settings.baseUrl)) {
      setModelOptions([])
      setModelStatus('idle')
      setModelError('')
      return
    }

    setModelStatus('loading')
    setModelError('')

    try {
      const ids = await fetchModelIds(settings, signal)
      setModelOptions(ids)
      setModelStatus('done')
      if (!settings.model.trim() && ids[0] && settings.defaultPresetId) {
        updatePreset(settings.defaultPresetId, { model: ids[0] })
      }
    } catch (modelFetchError) {
      if (modelFetchError instanceof DOMException && modelFetchError.name === 'AbortError') return
      setModelOptions([])
      setModelStatus('error')
      setModelError(
        modelFetchError instanceof Error
          ? `${modelFetchError.message}. Using fallback model list.`
          : 'Model API unavailable. Using fallback model list.',
      )
    }
  }

  useEffect(() => {
    // Same network-pseudo-provider guard as loadModels above.
    if (settings.connection === 'network' || isNetworkProviderBaseUrl(settings.baseUrl) || !normalizeBaseUrl(settings.baseUrl)) {
      setModelOptions([])
      setModelStatus('idle')
      setModelError('')
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadModels(controller.signal)
    }, 400)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [settings.apiKey, settings.baseUrl, settings.connection])

  return {
    settings,
    updateSettings,
    addProvider,
    updateProvider,
    removeProvider,
    addPreset,
    updatePreset,
    removePreset,
    setDefaultPresetId,
    setVisionPresetId,
    setNetworkProviderPresetIds,
    setReasoningEffort,
    modelOptions,
    modelStatus,
    modelError,
    loadModels,
    selectableModelOptions,
  }
}
