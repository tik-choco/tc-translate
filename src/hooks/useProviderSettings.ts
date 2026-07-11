import { useEffect, useMemo, useState } from 'preact/hooks'
import { defaultResolvedProvider, fallbackModelOptions } from '../constants'
import { fetchModelIds } from '../lib/api'
import { normalizeBaseUrl } from '../lib/format'
import {
  ensureDefaultTarget,
  setDefaultPresetModel,
  setDefaultPresetTemperature,
  setDefaultProviderConnection,
  setVisionPreset,
} from '../lib/llmConfigEdit'
import { resolvePreset } from '../lib/llmConfig'
import { loadSettings, saveSettings } from '../lib/storage'
import type { SharedLlmConfigState } from './useSharedLlmConfig'
import type { LocalProviderSettings, ModelStatus, ProviderSettings } from '../types'

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
    reasoningEffort: resolved?.reasoningEffort,
    connection: local.connection,
    roomId: config.network.roomId,
    networkProviderEnabled: local.networkProviderEnabled,
    visionPresetId: local.visionPresetId,
  }
}

export function useProviderSettings(llmConfigState: SharedLlmConfigState) {
  const [local, setLocal] = useState<LocalProviderSettings>(() => loadSettings())
  const settings = useMemo(() => mergeSettings(local, llmConfigState), [local, llmConfigState.config])

  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelError, setModelError] = useState('')

  const selectableModelOptions = useMemo(() => {
    const options = modelOptions.length ? modelOptions : fallbackModelOptions
    return [...new Set([settings.model, ...options].filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    )
  }, [modelOptions, settings.model])

  const selectableVisionModelOptions = useMemo(() => {
    const options = modelOptions.length ? modelOptions : fallbackModelOptions
    return [...new Set([settings.visionModel, ...options].filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    )
  }, [modelOptions, settings.visionModel])

  // Routes an edit to the merged runtime settings object to wherever it
  // actually lives: connection/networkProviderEnabled stay app-local;
  // baseUrl/apiKey/model/temperature/roomId/visionModel edit the shared
  // config's default provider/preset (creating them on first save if
  // absent) so other same-origin apps can reuse them.
  function updateSettings(next: ProviderSettings): void {
    if (next.connection !== settings.connection || next.networkProviderEnabled !== settings.networkProviderEnabled) {
      const nextLocal: LocalProviderSettings = {
        connection: next.connection,
        networkProviderEnabled: next.networkProviderEnabled,
        visionPresetId: local.visionPresetId,
      }
      setLocal(nextLocal)
      saveSettings(nextLocal)
    }

    let nextVisionPresetId = local.visionPresetId

    const baseUrlChanged = next.baseUrl !== settings.baseUrl
    const apiKeyChanged = next.apiKey !== settings.apiKey
    const modelChanged = next.model !== settings.model
    const temperatureChanged = next.temperature !== settings.temperature
    const visionModelChanged = next.visionModel !== settings.visionModel

    if (baseUrlChanged || apiKeyChanged || modelChanged || temperatureChanged || visionModelChanged) {
      llmConfigState.save((config) => {
        // If this is the very first edit (no default preset/provider yet),
        // seed ALL fields from the currently-displayed `next` snapshot, not
        // just the one the user is editing - otherwise typing Base URL first
        // would leave `model`/`temperature` blank instead of the pre-filled
        // defaults the form was already showing. Subsequent edits reuse the
        // existing entry (see ensureDefaultTarget), so this is a no-op then.
        ensureDefaultTarget(config, {
          baseUrl: next.baseUrl,
          apiKey: next.apiKey,
          model: next.model,
          temperature: next.temperature,
        })
        if (baseUrlChanged || apiKeyChanged) setDefaultProviderConnection(config, next.baseUrl, next.apiKey)
        if (modelChanged) setDefaultPresetModel(config, next.model)
        if (temperatureChanged) setDefaultPresetTemperature(config, next.temperature)
        if (visionModelChanged) {
          nextVisionPresetId = setVisionPreset(config, local.visionPresetId, next.visionModel, modelChanged ? next.model : settings.model)
        }
      })
    }

    if (next.roomId !== settings.roomId) {
      llmConfigState.save((config) => {
        config.network.roomId = next.roomId
      })
    }

    if (nextVisionPresetId !== local.visionPresetId) {
      const nextLocal: LocalProviderSettings = { ...local, visionPresetId: nextVisionPresetId }
      setLocal(nextLocal)
      saveSettings(nextLocal)
    }
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
      if (!settings.model.trim() && ids[0]) {
        updateSettings({ ...settings, model: ids[0] })
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
    modelOptions,
    modelStatus,
    modelError,
    loadModels,
    selectableModelOptions,
    selectableVisionModelOptions,
  }
}
