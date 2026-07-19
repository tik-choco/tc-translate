import { useMemo, useState } from 'preact/hooks'
import { setVoiceConfig } from '../lib/llmConfigEdit'
import { loadSttSettings, saveSttSettings } from '../lib/storage'
import { deriveVoiceEngine } from '../lib/voice'
import type { SharedLlmConfigState } from './useSharedLlmConfig'
import type { LocalSttSettings, SttSettings, TtsSettings } from '../types'

// TTS has no app-local settings left: `engine` is derived from the shared llm
// config (deriveVoiceEngine, lib/voice.ts) and model/voice/provider live in
// `config.tts`. STT keeps `micDeviceId` app-local; its engine is derived the
// same way from `config.stt`.
export function useVoiceSettings(llmConfigState: SharedLlmConfigState) {
  const [localStt, setLocalStt] = useState<LocalSttSettings>(() => loadSttSettings())

  const ttsSettings = useMemo<TtsSettings>(() => {
    const shared = llmConfigState.config.tts
    return {
      engine: deriveVoiceEngine(llmConfigState.config, 'tts'),
      providerId: shared?.providerId,
      model: shared?.model ?? '',
      voice: shared?.voice ?? '',
    }
  }, [llmConfigState.config])

  const sttSettings = useMemo<SttSettings>(() => {
    const shared = llmConfigState.config.stt
    return {
      engine: deriveVoiceEngine(llmConfigState.config, 'stt'),
      micDeviceId: localStt.micDeviceId,
      providerId: shared?.providerId,
      model: shared?.model ?? '',
    }
  }, [localStt, llmConfigState.config])

  function updateTtsSettings(next: TtsSettings): void {
    // next.engine is ignored: it's derived, not settable.
    if (next.providerId !== ttsSettings.providerId || next.model !== ttsSettings.model || next.voice !== ttsSettings.voice) {
      llmConfigState.save((config) => {
        setVoiceConfig(config, 'tts', { providerId: next.providerId, model: next.model, voice: next.voice })
      })
    }
  }

  function updateSttSettings(next: SttSettings): void {
    // next.engine is ignored: it's derived, not settable.
    if (next.micDeviceId !== localStt.micDeviceId) {
      const nextLocal: LocalSttSettings = { micDeviceId: next.micDeviceId }
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
