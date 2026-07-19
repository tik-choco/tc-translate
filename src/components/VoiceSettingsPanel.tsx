import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { OPENAI_TTS_VOICES, fetchVoices } from '../lib/voices'
import type { LlmProviderV1, ModelPresetV1 } from '../lib/llmConfig'
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
  /** Presets ("models") in the shared llm config, for the model pickers below. */
  llmPresets: ModelPresetV1[]
  /**
   * The default LLM preset's connection, used to list TTS voices when no
   * dedicated TTS provider is picked (mirrors resolveVoice's fallback).
   */
  defaultVoiceConnection: { baseUrl: string; apiKey: string }
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
  llmPresets,
  defaultVoiceConnection,
}: VoiceSettingsPanelProps) {
  const { microphones, labelsHidden, enumerationSupported, unlockLabels } = useMicrophones()
  const knownMic = microphones.some((mic) => mic.deviceId === sttSettings.micDeviceId)

  // The model pickers offer the presets registered in the AI Connection tab
  // and store a choice as the preset's providerId+model pair — the shared
  // voice config has no presetId field and other tik-choco apps read
  // providerId/model directly, so the wire shape stays untouched. "Custom"
  // mode re-exposes the provider + free-text model fields; it starts on when
  // the stored pair doesn't correspond to any preset (hand-typed configs).
  const matchedTtsPreset = llmPresets.find(
    (preset) => preset.providerId === ttsSettings.providerId && preset.model === ttsSettings.model,
  )
  const matchedSttPreset = llmPresets.find(
    (preset) => preset.providerId === sttSettings.providerId && preset.model === sttSettings.model,
  )
  const [ttsCustom, setTtsCustom] = useState(() => !matchedTtsPreset)
  const [sttCustom, setSttCustom] = useState(() => !matchedSttPreset)

  // The connection TTS/STT actually resolve to, mirroring resolveVoice
  // (lib/llmConfig.ts) exactly: an explicitly picked provider must exist (a
  // dangling id does NOT fall back to the default), otherwise the default
  // preset's connection. An empty baseUrl here means the speech request would
  // silently fail / fall back, so it drives the warnings below. Kept as
  // primitives so the fetch effect only re-runs when the connection changes.
  const ttsProvider = ttsSettings.providerId ? llmProviders.find((entry) => entry.id === ttsSettings.providerId) : undefined
  const ttsBaseUrl = ttsSettings.providerId ? (ttsProvider?.baseUrl ?? '') : defaultVoiceConnection.baseUrl
  const ttsApiKey = ttsSettings.providerId ? (ttsProvider?.apiKey ?? '') : defaultVoiceConnection.apiKey
  const sttProvider = sttSettings.providerId ? llmProviders.find((entry) => entry.id === sttSettings.providerId) : undefined
  const sttBaseUrl = sttSettings.providerId ? (sttProvider?.baseUrl ?? '') : defaultVoiceConnection.baseUrl

  // Voice names offered in the TTS voice picker. OpenAI itself has no
  // voices-listing endpoint, so failures (and the network/browser engines,
  // which can't be probed over HTTP from here) quietly fall back to the
  // documented OpenAI voice set; a voice saved from another server stays
  // selectable via the extra <option> below either way.
  const [voiceOptions, setVoiceOptions] = useState<string[]>(OPENAI_TTS_VOICES)
  useEffect(() => {
    if (ttsSettings.engine !== 'api' || !ttsBaseUrl.trim()) {
      setVoiceOptions(OPENAI_TTS_VOICES)
      return
    }

    const controller = new AbortController()
    // Debounced like the model-list fetch, so switching providers quickly
    // doesn't fire a request per click.
    const timer = window.setTimeout(() => {
      fetchVoices({ baseUrl: ttsBaseUrl, apiKey: ttsApiKey }, controller.signal)
        .then((voices) => setVoiceOptions(voices))
        .catch(() => {
          if (!controller.signal.aborted) setVoiceOptions(OPENAI_TTS_VOICES)
        })
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [ttsSettings.engine, ttsBaseUrl, ttsApiKey])

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
        <span>{t('voice-tts-model-label')}</span>
        <select
          value={ttsCustom ? '' : (matchedTtsPreset?.id ?? '')}
          onChange={(event) => {
            const presetId = event.currentTarget.value
            if (!presetId) {
              setTtsCustom(true)
              return
            }
            const preset = llmPresets.find((entry) => entry.id === presetId)
            if (!preset) return
            setTtsCustom(false)
            onUpdateTtsSettings({ ...ttsSettings, providerId: preset.providerId, model: preset.model })
          }}
          aria-label={t('voice-tts-model-label')}
        >
          <option value="">{t('voice-model-custom-option')}</option>
          {llmPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label || preset.model || preset.id}
            </option>
          ))}
        </select>
      </label>
      {ttsCustom ? (
        <>
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
            <span>{t('voice-model-custom-label')}</span>
            <input
              value={ttsSettings.model}
              onInput={(event) => onUpdateTtsSettings({ ...ttsSettings, model: event.currentTarget.value })}
              placeholder="tts-1"
            />
          </label>
        </>
      ) : null}
      {ttsSettings.engine === 'api' && !ttsBaseUrl.trim() ? (
        <p class="error-text">{t('voice-connection-unresolved')}</p>
      ) : null}

      <label>
        <span>{t('voice-tts-voice-label')}</span>
        <select
          value={ttsSettings.voice}
          onChange={(event) => onUpdateTtsSettings({ ...ttsSettings, voice: event.currentTarget.value })}
          aria-label={t('voice-tts-voice-label')}
        >
          {!ttsSettings.voice ? <option value="" disabled /> : null}
          {ttsSettings.voice && !voiceOptions.includes(ttsSettings.voice) ? (
            <option value={ttsSettings.voice}>{ttsSettings.voice}</option>
          ) : null}
          {voiceOptions.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
        </select>
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
            <span>{t('voice-stt-model-label')}</span>
            <select
              value={sttCustom ? '' : (matchedSttPreset?.id ?? '')}
              onChange={(event) => {
                const presetId = event.currentTarget.value
                if (!presetId) {
                  setSttCustom(true)
                  return
                }
                const preset = llmPresets.find((entry) => entry.id === presetId)
                if (!preset) return
                setSttCustom(false)
                onUpdateSttSettings({ ...sttSettings, providerId: preset.providerId, model: preset.model })
              }}
              aria-label={t('voice-stt-model-label')}
            >
              <option value="">{t('voice-model-custom-option')}</option>
              {llmPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label || preset.model || preset.id}
                </option>
              ))}
            </select>
          </label>
          {sttCustom ? (
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
                <span>{t('voice-model-custom-label')}</span>
                <input
                  value={sttSettings.model}
                  onInput={(event) => onUpdateSttSettings({ ...sttSettings, model: event.currentTarget.value })}
                  placeholder="whisper-1"
                />
              </label>
            </>
          ) : null}
          {sttSettings.engine === 'api' && !sttBaseUrl.trim() ? (
            <p class="error-text">{`${t('voice-connection-unresolved')} ${t('voice-stt-unresolved-fallback')}`}</p>
          ) : null}
          {sttSettings.engine === 'api' && sttBaseUrl.trim() && !sttSettings.model.trim() ? (
            <p class="error-text">{`${t('voice-stt-model-missing')} ${t('voice-stt-unresolved-fallback')}`}</p>
          ) : null}
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
