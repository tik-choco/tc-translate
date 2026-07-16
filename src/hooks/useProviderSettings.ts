import { useEffect, useMemo, useState } from 'preact/hooks'
import { defaultResolvedProvider, fallbackModelOptions } from '../constants'
import { fetchModelIds } from '../lib/api'
import { normalizeBaseUrl } from '../lib/format'
import { createPreset, createProvider, deletePreset, deleteProvider, patchPreset, patchProvider } from '../lib/llmConfigEdit'
import { resolvePreset } from '../lib/llmConfig'
import { loadSettings, saveSettings } from '../lib/storage'
import type { SharedLlmConfigState } from './useSharedLlmConfig'
import type { LlmProviderV1, ModelPresetV1 } from '../lib/llmConfig'
import type { LocalProviderSettings, ModelStatus, ProviderSettings } from '../types'

function mergeSettings(local: LocalProviderSettings, llmConfigState: SharedLlmConfigState): ProviderSettings {
  const config = llmConfigState.config
  const resolved = resolvePreset(config)
  const visionResolved = resolvePreset(config, local.visionPresetId)
  // Unlike vision (which should fall back to the default preset's model),
  // orchestrator/worker fall back to their own opinionated defaults
  // (defaultResolvedProvider.orchestratorModel/workerModel) - so resolvePreset
  // is only consulted when a dedicated preset id is actually set; passing ''
  // would make it fall back to the shared default preset instead.
  const orchestratorResolved = local.orchestratorPresetId ? resolvePreset(config, local.orchestratorPresetId) : null
  const workerResolved = local.workerPresetId ? resolvePreset(config, local.workerPresetId) : null

  return {
    baseUrl: resolved?.baseUrl ?? defaultResolvedProvider.baseUrl,
    apiKey: resolved?.apiKey ?? defaultResolvedProvider.apiKey,
    model: resolved?.model ?? defaultResolvedProvider.model,
    visionModel: visionResolved?.model ?? resolved?.model ?? defaultResolvedProvider.visionModel,
    orchestratorModel: orchestratorResolved?.model ?? defaultResolvedProvider.orchestratorModel,
    workerModel: workerResolved?.model ?? defaultResolvedProvider.workerModel,
    temperature: resolved?.temperature ?? defaultResolvedProvider.temperature,
    reasoningEffort: resolved?.reasoningEffort,
    connection: local.connection,
    roomId: config.network.roomId,
    networkProviderEnabled: local.networkProviderEnabled,
    visionPresetId: local.visionPresetId,
    orchestratorPresetId: local.orchestratorPresetId,
    workerPresetId: local.workerPresetId,
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
  // vision/orchestrator/worker now go through the provider/preset CRUD below,
  // which edits the shared config's `providers`/`presets` arrays directly.
  function updateSettings(next: ProviderSettings): void {
    if (next.connection !== settings.connection || next.networkProviderEnabled !== settings.networkProviderEnabled) {
      const nextLocal: LocalProviderSettings = {
        connection: next.connection,
        networkProviderEnabled: next.networkProviderEnabled,
        visionPresetId: local.visionPresetId,
        orchestratorPresetId: local.orchestratorPresetId,
        workerPresetId: local.workerPresetId,
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

  function addProvider(label: string): void {
    llmConfigState.save((config) => {
      createProvider(config, label)
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

  function addPreset(providerId: string, label: string): void {
    llmConfigState.save((config) => {
      createPreset(config, providerId, label)
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

  function setOrchestratorPresetId(id: string): void {
    const nextLocal: LocalProviderSettings = { ...local, orchestratorPresetId: id }
    setLocal(nextLocal)
    saveSettings(nextLocal)
  }

  function setWorkerPresetId(id: string): void {
    const nextLocal: LocalProviderSettings = { ...local, workerPresetId: id }
    setLocal(nextLocal)
    saveSettings(nextLocal)
  }

  async function loadModels(signal?: AbortSignal): Promise<void> {
    if (settings.connection === 'network' || !normalizeBaseUrl(settings.baseUrl)) {
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
    if (settings.connection === 'network' || !normalizeBaseUrl(settings.baseUrl)) {
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
    setOrchestratorPresetId,
    setWorkerPresetId,
    modelOptions,
    modelStatus,
    modelError,
    loadModels,
    selectableModelOptions,
  }
}
