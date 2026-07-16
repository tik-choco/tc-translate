import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import type { LlmProviderV1 } from '../lib/llmConfig'
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

type VoiceSettingsPanelProps = {
  ttsSettings: TtsSettings
  onUpdateTtsSettings: (next: TtsSettings) => void
  sttSettings: SttSettings
  onUpdateSttSettings: (next: SttSettings) => void
  /** Providers in the shared llm config, for the "provider" picker below. */
  llmProviders: LlmProviderV1[]
}

// TTS/STT ("voice") settings tab, split out of SettingsModal to keep that file
// focused on tab routing. The "Network" engine on either select routes voice
// requests through the LLM Network provider instead of a direct HTTP endpoint.
// baseUrl/apiKey are no longer edited here - TTS/STT reuse a provider from
// the shared llm config (see lib/llmConfig.ts): the picker below chooses
// which one, defaulting to "same as the default LLM preset".
export function VoiceSettingsPanel({
  ttsSettings,
  onUpdateTtsSettings,
  sttSettings,
  onUpdateSttSettings,
  llmProviders,
}: VoiceSettingsPanelProps) {
  const { microphones, labelsHidden, enumerationSupported, unlockLabels } = useMicrophones()
  const knownMic = microphones.some((mic) => mic.deviceId === sttSettings.micDeviceId)

  return (
    <div class="settings-tab-panel" role="tabpanel">
      <h2 class="settings-section-title">{t('voice-tts-heading')}</h2>

      <label>
        <span>{t('voice-tts-engine-label')}</span>
        <select
          value={ttsSettings.engine}
          onChange={(event) => {
            const value = event.currentTarget.value
            onUpdateTtsSettings({
              ...ttsSettings,
              engine: value === 'api' ? 'api' : value === 'network' ? 'network' : 'browser',
            })
          }}
          aria-label={t('voice-tts-engine-label')}
        >
          <option value="browser">{t('voice-engine-option-browser')}</option>
          <option value="api">{t('voice-engine-option-api')}</option>
          <option value="network">{t('voice-engine-option-network')}</option>
        </select>
      </label>
      {ttsSettings.engine === 'network' ? <p class="hint">{t('voice-network-engine-hint')}</p> : null}

      <label>
        <span>{t('voice-provider-label')}</span>
        <select
          value={ttsSettings.providerId ?? ''}
          onChange={(event) => onUpdateTtsSettings({ ...ttsSettings, providerId: event.currentTarget.value || undefined })}
          aria-label={t('voice-provider-label')}
        >
          <option value="">{t('voice-provider-same-as-llm')}</option>
          {llmProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>{t('voice-tts-model-label')}</span>
        <input
          value={ttsSettings.model}
          onInput={(event) => onUpdateTtsSettings({ ...ttsSettings, model: event.currentTarget.value })}
          placeholder="tts-1"
        />
      </label>

      <label>
        <span>{t('voice-tts-voice-label')}</span>
        <input
          value={ttsSettings.voice}
          onInput={(event) => onUpdateTtsSettings({ ...ttsSettings, voice: event.currentTarget.value })}
          placeholder="alloy"
        />
      </label>

      <h2 class="settings-section-title">{t('voice-stt-heading')}</h2>

      <label>
        <span>{t('voice-stt-engine-label')}</span>
        <select
          value={sttSettings.engine}
          onChange={(event) => {
            const value = event.currentTarget.value
            onUpdateSttSettings({
              ...sttSettings,
              engine: value === 'network' ? 'network' : value === 'browser' ? 'browser' : 'api',
            })
          }}
          aria-label={t('voice-stt-engine-label')}
        >
          <option value="api">{t('voice-engine-option-api')}</option>
          <option value="network">{t('voice-engine-option-network')}</option>
          <option value="browser">{t('voice-engine-option-stt-browser')}</option>
        </select>
      </label>
      {sttSettings.engine === 'network' ? <p class="hint">{t('voice-network-engine-hint')}</p> : null}
      {sttSettings.engine === 'browser' ? <p class="hint">{t('voice-stt-browser-engine-hint')}</p> : null}

      {sttSettings.engine !== 'browser' ? (
        <>
          <label>
            <span>{t('voice-provider-label')}</span>
            <select
              value={sttSettings.providerId ?? ''}
              onChange={(event) => onUpdateSttSettings({ ...sttSettings, providerId: event.currentTarget.value || undefined })}
              aria-label={t('voice-provider-label')}
            >
              <option value="">{t('voice-provider-same-as-llm')}</option>
              {llmProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('voice-stt-model-label')}</span>
            <input
              value={sttSettings.model}
              onInput={(event) => onUpdateSttSettings({ ...sttSettings, model: event.currentTarget.value })}
              placeholder="whisper-1"
            />
          </label>
        </>
      ) : null}

      {enumerationSupported ? (
        <label>
          <span>{t('voice-mic-label')}</span>
          <select
            value={knownMic ? sttSettings.micDeviceId : ''}
            onChange={(event) =>
              onUpdateSttSettings({ ...sttSettings, micDeviceId: event.currentTarget.value })
            }
            aria-label={t('voice-mic-label')}
          >
            <option value="">{t('voice-mic-default-option')}</option>
            {microphones.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {labelsHidden ? (
        <p class="hint">
          {t('voice-mic-permission-hint')}
          <button type="button" class="link-button" onClick={() => void unlockLabels()}>
            {t('voice-mic-permission-button')}
          </button>
        </p>
      ) : null}
      {enumerationSupported ? <p class="hint">{t('voice-mic-scope-hint')}</p> : null}
    </div>
  )
}
