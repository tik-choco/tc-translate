import { useMemo, useRef, useState } from 'preact/hooks'
import { refreshProviderModels } from '../lib/providerModels'
import { createProvider, deleteProvider, patchProvider } from '../lib/llmConfigEdit'
import { resolveModel, type LlmProviderV1, type ModelRefV1 } from '../lib/llmConfig'
import { loadSettings, saveSettings } from '../lib/storage'
import type { SharedLlmConfigState } from './useSharedLlmConfig'
import type { LocalProviderSettings, PerformanceMode, ProviderSettings, ReasoningEffort, ReasoningTask, RoomProvide } from '../types'

export function useProviderSettings(state: SharedLlmConfigState) {
  const [local, setLocal] = useState<LocalProviderSettings>(loadSettings)
  const localRef = useRef(local)
  localRef.current = local
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
  function edit(mutate: (next: LocalProviderSettings) => void) {
    const next = structuredClone(localRef.current)
    mutate(next)
    localRef.current = next
    setLocal(next)
    saveSettings(next)
  }
  function rememberModel(ref?: ModelRefV1) {
    if (ref) edit(next => { next.recentModels = [ref, ...next.recentModels.filter(r => r.providerId !== ref.providerId || r.model !== ref.model)].slice(0, 8) })
  }
  function setTaskRef(task: ReasoningTask, ref?: ModelRefV1) {
    edit(next => { next.tasks[task].ref = ref })
    rememberModel(ref)
  }
  function setDefaultModel(ref?: ModelRefV1) {
    state.save(config => { config.defaultModel = ref })
    rememberModel(ref)
  }
  function setRoomProvide(id: string, value: RoomProvide) { edit(next => { next.roomProvide[id] = value }) }
  function setReasoningEffort(task: ReasoningTask, effort: ReasoningEffort) { edit(next => { next.tasks[task].reasoningEffort = effort }) }
  function setPerformanceMode(mode: PerformanceMode) { edit(next => { next.performanceMode = mode }) }
  function addProvider(label: string, patch?: Partial<Omit<LlmProviderV1, 'id'>>) {
    let id = ''
    state.save(config => { id = createProvider(config, label); if (patch) patchProvider(config, id, patch) })
    void refreshProviderModels(id, true)
    return id
  }
  function updateProvider(id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>) {
    let refresh = false
    state.save(config => {
      const previous = config.providers.find(p => p.id === id)
      refresh = !!previous && ((patch.baseUrl !== undefined && patch.baseUrl !== previous.baseUrl) || (patch.apiKey !== undefined && patch.apiKey !== previous.apiKey) || (patch.enabled === true && previous.enabled === false))
      patchProvider(config, id, patch)
    })
    if (refresh) void refreshProviderModels(id, true)
  }
  function removeProvider(id: string) { state.save(config => deleteProvider(config, id)) }
  return { settings, setTaskRef, setDefaultModel, setRoomProvide, rememberModel, setReasoningEffort, setPerformanceMode, addProvider, updateProvider, removeProvider }
}
