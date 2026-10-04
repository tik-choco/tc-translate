import { useMemo, useRef, useState } from 'preact/hooks'
import { resolveModel } from '@tik-choco/mistai/llm-config'
import type { LlmSettingsLocalAdapter, useLlmConfig } from '@tik-choco/mistai/preact'
import { loadSettings, saveSettings } from '../lib/storage'
import type { LocalProviderSettings, PerformanceMode, ProviderSettings } from '../types'

export function useProviderSettings(state: ReturnType<typeof useLlmConfig>) {
  const [local, setLocal] = useState<LocalProviderSettings>(loadSettings)
  const localRef = useRef(local)
  localRef.current = local
  function persist(next: LocalProviderSettings) {
    localRef.current = next
    setLocal(next)
    saveSettings(next)
  }
  const localSettings = useMemo<LlmSettingsLocalAdapter>(() => ({
    get: () => localRef.current,
    set: next => persist({ ...localRef.current, ...next } as LocalProviderSettings),
  }), [])
  const settings = useMemo<ProviderSettings>(() => {
    const target = resolveModel(state.config, local.tasks.default.ref)
    const vision = resolveModel(state.config, local.tasks.vision.ref)
    return {
      ...local, baseUrl: target?.baseUrl ?? '', apiKey: target?.apiKey ?? '', model: target?.model ?? '',
      visionModel: vision?.model ?? '', visionTarget: vision,
      reasoningEffort: local.performanceMode === 'fast' ? 'none' : local.tasks.default.reasoningEffort,
      defaultReasoningEffort: local.tasks.default.reasoningEffort, visionReasoningEffort: local.tasks.vision.reasoningEffort,
      providers: state.config.providers, defaultModel: state.config.defaultModel,
    }
  }, [local, state.config])
  function setPerformanceMode(mode: PerformanceMode) { persist({ ...localRef.current, performanceMode: mode }) }
  return { settings, localSettings, setPerformanceMode }
}
