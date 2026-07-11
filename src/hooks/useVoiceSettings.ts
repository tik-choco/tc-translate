import { useMemo, useState } from 'preact/hooks'
import { setVoiceConfig } from '../lib/llmConfigEdit'
import { loadSttSettings, loadTtsSettings, saveSttSettings, saveTtsSettings } from '../lib/storage'
import type { SharedLlmConfigState } from './useSharedLlmConfig'
import type { LocalSttSettings, LocalTtsSettings, SttSettings, TtsSettings } from '../types'

export function useVoiceSettings(llmConfigState: SharedLlmConfigState) {
  const [localTts, setLocalTts] = useState<LocalTtsSettings>(() => loadTtsSettings())
  const [localStt, setLocalStt] = useState<LocalSttSettings>(() => loadSttSettings())

  const ttsSettings = useMemo<TtsSettings>(() => {
    const shared = llmConfigState.config.tts
    return {
      engine: localTts.engine,
      providerId: shared?.providerId,
      model: shared?.model ?? '',
      voice: shared?.voice ?? '',
    }
  }, [localTts, llmConfigState.config.tts])

  const sttSettings = useMemo<SttSettings>(() => {
    const shared = llmConfigState.config.stt
    return {
      engine: localStt.engine,
      micDeviceId: localStt.micDeviceId,
      providerId: shared?.providerId,
      model: shared?.model ?? '',
    }
  }, [localStt, llmConfigState.config.stt])

  function updateTtsSettings(next: TtsSettings): void {
    if (next.engine !== localTts.engine) {
      const nextLocal: LocalTtsSettings = { engine: next.engine }
      setLocalTts(nextLocal)
      saveTtsSettings(nextLocal)
    }

    if (next.providerId !== ttsSettings.providerId || next.model !== ttsSettings.model || next.voice !== ttsSettings.voice) {
      llmConfigState.save((config) => {
        setVoiceConfig(config, 'tts', { providerId: next.providerId, model: next.model, voice: next.voice })
      })
    }
  }

  function updateSttSettings(next: SttSettings): void {
    if (next.engine !== localStt.engine || next.micDeviceId !== localStt.micDeviceId) {
      const nextLocal: LocalSttSettings = { engine: next.engine, micDeviceId: next.micDeviceId }
      setLocalStt(nextLocal)
      saveSttSettings(nextLocal)
    }

    if (next.providerId !== sttSettings.providerId || next.model !== sttSettings.model) {
      llmConfigState.save((config) => {
        setVoiceConfig(config, 'stt', { providerId: next.providerId, model: next.model })
      })
    }
  }

  return { ttsSettings, updateTtsSettings, sttSettings, updateSttSettings }
}
