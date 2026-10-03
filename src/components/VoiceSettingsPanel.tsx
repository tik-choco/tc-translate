import { ChoicePicker } from './ChoicePicker'
import { ModelPicker, useLiveModels } from './ModelPicker'
import { useEffect, useState } from 'preact/hooks'
import { fetchVoices } from '@tik-choco/mistai'
import { buildTtsVoiceOptionValues, resolveTtsVoiceOptions, shouldShowTtsVoiceRow } from '@tik-choco/mistai/preact'
import { t } from '../i18n'
import type { LlmProviderV1, ModelRefV1 } from '../lib/llmConfig'
import type { SttSettings, TtsSettings } from '../types'

type MicOption = { deviceId: string; label: string }

// Enumerates audio inputs for the microphone picker. Device labels stay blank
// until the user has granted mic permission at least once, so the picker
// exposes a button that requests a throwaway stream to unlock them.
function useMicrophones() {
  const [microphones, setMicrophones] = useState<MicOption[]>([])
  const [labelsHidden, setLabelsHidden] = useState(false)
  const enumerationSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.enumerateDevices)

  async function refresh(): Promise<void> {
    if (!enumerationSupported) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices.filter((device) => device.kind === 'audioinput' && device.deviceId)
      setMicrophones(
        inputs.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || t('voice-mic-fallback-label', { index: index + 1 }),
        })),
      )
      setLabelsHidden(inputs.length > 0 && inputs.every((device) => !device.label))
    } catch {
      // Enumeration failing just leaves the picker on "default".
    }
  }

  async function unlockLabels(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
    } catch {
      // Permission denied: keep whatever we have.
    }
    await refresh()
  }

  useEffect(() => {
    void refresh()
    const mediaDevices = enumerationSupported ? navigator.mediaDevices : undefined
    mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => mediaDevices?.removeEventListener?.('devicechange', refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { microphones, labelsHidden, enumerationSupported, unlockLabels }
}

type VoiceTaskRowsProps = {
  ttsSettings: TtsSettings; onUpdateTtsSettings: (next: TtsSettings) => void;
  sttSettings: SttSettings; onUpdateSttSettings: (next: SttSettings) => void;
  providers: LlmProviderV1[]; recent: ModelRefV1[]; onRememberModel: (ref?: ModelRefV1) => void;
  defaultProviderId?: string;
}
export function VoiceTaskRows({ ttsSettings, onUpdateTtsSettings, sttSettings, onUpdateSttSettings, providers, recent, onRememberModel, defaultProviderId }: VoiceTaskRowsProps) {
  const { microphones, labelsHidden, enumerationSupported, unlockLabels } = useMicrophones()
  const statuses = useLiveModels(providers)
  const ttsProvider = providers.find(p => p.id === (ttsSettings.providerId ?? defaultProviderId))
  const [fetchedApiVoices, setFetchedApiVoices] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    setFetchedApiVoices([])
    if (ttsSettings.engine !== 'api' || !ttsProvider || ttsProvider.enabled === false) return
    const timer = window.setTimeout(() => {
      fetchVoices(ttsProvider.baseUrl, ttsProvider.apiKey).then(voices => { if (!cancelled) setFetchedApiVoices(voices) })
    }, 300)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [ttsProvider?.baseUrl, ttsProvider?.apiKey, ttsProvider?.enabled, ttsSettings.engine])
  const consumerStatus = statuses[ttsProvider?.id ?? ''] ?? { phase: 'idle' as const }
  const voices = buildTtsVoiceOptionValues(resolveTtsVoiceOptions({ engine: ttsSettings.engine, consumerStatus, fetchedApiVoices }), ttsSettings.voice)
  return <>
    <div class="provider-task-row">
      <span data-tip={t('voice-tts-tip')}>{t('voice-tts-heading')}</span>
      <ModelPicker providers={providers} recent={recent} label={t('voice-tts-model-label')} voice clearLabel={t('voice-model-browser-option')}
        value={ttsSettings.model ? { providerId: ttsSettings.providerId ?? defaultProviderId ?? '', model: ttsSettings.model } : undefined}
        onChange={ref => { onUpdateTtsSettings({ ...ttsSettings, providerId: ref?.providerId, model: ref?.model ?? '' }); onRememberModel(ref) }} />
    </div>
    {shouldShowTtsVoiceRow(true, ttsSettings.engine) && <div class="provider-task-row"><span>{t('voice-tts-voice-label')}</span>
      <ChoicePicker label={t('voice-tts-voice-label')} value={ttsSettings.voice} options={voices.map(v => ({ value: v, label: v || t('voice-provider-default-option') }))} onChange={voice => onUpdateTtsSettings({ ...ttsSettings, voice })} />
    </div>}
    <div class="provider-task-row">
      <span data-tip={t('voice-stt-tip')}>{t('voice-stt-heading')}</span>
      <ModelPicker providers={providers} recent={recent} label={t('voice-stt-model-label')} voice clearLabel={t('voice-model-browser-option')}
        value={sttSettings.model ? { providerId: sttSettings.providerId ?? defaultProviderId ?? '', model: sttSettings.model } : undefined}
        onChange={ref => { onUpdateSttSettings({ ...sttSettings, providerId: ref?.providerId, model: ref?.model ?? '' }); onRememberModel(ref) }} />
    </div>
    {enumerationSupported && <div class="provider-task-row"><span>{t('voice-mic-label')}</span>
      <ChoicePicker className="mic-picker" label={t('voice-mic-label')} value={sttSettings.micDeviceId} options={[{ value: '', label: t('voice-mic-default-option') }, ...microphones.map(m => ({ value: m.deviceId, label: m.label }))]} onChange={micDeviceId => onUpdateSttSettings({ ...sttSettings, micDeviceId })} /></div>}
    {labelsHidden && <p class="hint">{t('voice-mic-permission-hint')} <button class="link-button" onClick={() => void unlockLabels()}>{t('voice-mic-permission-button')}</button></p>}
  </>
}
