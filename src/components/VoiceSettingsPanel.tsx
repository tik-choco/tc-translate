import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { NETWORK_VOICE_AUTO_MODEL } from '../lib/networkModels'
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

type VoiceTaskRowsProps = {
  ttsSettings: TtsSettings
  onUpdateTtsSettings: (next: TtsSettings) => void
  sttSettings: SttSettings
  onUpdateSttSettings: (next: SttSettings) => void
  /** Providers in the shared llm config, used to resolve the picked model's connection for the warnings/voice fetch below. */
  llmProviders: LlmProviderV1[]
  /** Presets ("models") in the shared llm config, for the model pickers below. */
  llmPresets: ModelPresetV1[]
  /**
   * The default LLM preset's connection, used to list TTS voices when no
   * dedicated TTS provider is picked (mirrors resolveVoice's fallback).
   */
  defaultVoiceConnection: { baseUrl: string; apiKey: string }
  /** The room's mist-network:// pseudo-provider id, '' when none imported yet. Drives the "AI Networkにおまかせ" option below. */
  networkVoiceProviderId: string
  /** True when `providerId` resolves to a `mist-network://` pseudo-provider. Checked against the unfiltered provider list (unlike `llmProviders` above), so it stays correct for network-imported presets even though those pseudo-providers are excluded from `llmProviders`. */
  isNetworkPresetProvider: (providerId: string) => boolean
  /** Live AI Network room connection (as opposed to a `mist-network://` provider/preset merely existing in the shared config, which outlives any single connection). Network-origin choices are hidden from the pickers below while disconnected, and reappear selected on their own once `ttsSettings`/`sttSettings` still point at them and the room reconnects. */
  networkConnected: boolean
}

// TTS/STT ("voice") task rows, rendered inside SettingsModal's Tasks tab
// panel (split out into this file to keep that file focused on tab
// routing). There's no explicit "engine" select any more - the model picker
// below is the single control, and ttsSettings.engine/sttSettings.engine are
// derived elsewhere (useProviderSettings) from whether a model is set and
// which provider it resolves to: no model -> "browser", a `mist-network://`
// provider -> "network", otherwise "api". baseUrl/apiKey are no longer
// edited here - TTS/STT reuse a provider from the shared llm config (see
// lib/llmConfig.ts): picking a preset below also picks its provider,
// defaulting to "same as the default LLM preset" when a preset has no
// provider override.
export function VoiceTaskRows({
  ttsSettings,
  onUpdateTtsSettings,
  sttSettings,
  onUpdateSttSettings,
  llmProviders,
  llmPresets,
  defaultVoiceConnection,
  networkVoiceProviderId,
  isNetworkPresetProvider,
  networkConnected,
}: VoiceTaskRowsProps) {
  const { microphones, labelsHidden, enumerationSupported, unlockLabels } = useMicrophones()
  const knownMic = microphones.some((mic) => mic.deviceId === sttSettings.micDeviceId)

  // The model pickers offer: "Browser (not set)" (clears providerId/model,
  // which drives the derived engine to 'browser'), "AI Networkにおまかせ" (see
  // below - only when a room provider is imported), or a preset from the AI
  // Connection tab (network-imported presets included - their provider is
  // the `mist-network://` pseudo-provider, which derives 'network'). A choice
  // is stored as the preset's providerId+model pair — the shared voice config
  // has no presetId field and other tik-choco apps read providerId/model
  // directly, so the wire shape stays untouched. A stored pair that matches
  // no preset (written by another app, or a preset since deleted) stays
  // visible/selected via an extra read-only option rather than being silently
  // rendered as "not set".
  const matchedTtsPreset = llmPresets.find(
    (preset) => preset.providerId === ttsSettings.providerId && preset.model === ttsSettings.model,
  )
  const matchedSttPreset = llmPresets.find(
    (preset) => preset.providerId === sttSettings.providerId && preset.model === sttSettings.model,
  )

  // True when `preset`'s connection is the `mist-network://` pseudo-provider
  // (a model advertised by the AI Network room), used to color it apart from
  // presets backed by a regular HTTP connection in the pickers below. Can't
  // use `llmProviders` for this (it excludes network pseudo-providers, see
  // the comment above its prop) - `isNetworkPresetProvider` checks the
  // unfiltered provider list instead.
  function isNetworkPreset(preset: ModelPresetV1): boolean {
    return isNetworkPresetProvider(preset.providerId)
  }

  // "AI Networkにおまかせ": providerId points at the room's pseudo-provider and
  // model is the auto sentinel (see lib/networkModels.ts) rather than any
  // advertised preset. Checked before the matched-preset/'__current__' logic
  // below so the sentinel never falls through to those branches.
  const isTtsNetworkAuto =
    networkVoiceProviderId !== '' &&
    ttsSettings.providerId === networkVoiceProviderId &&
    ttsSettings.model === NETWORK_VOICE_AUTO_MODEL
  const isSttNetworkAuto =
    networkVoiceProviderId !== '' &&
    sttSettings.providerId === networkVoiceProviderId &&
    sttSettings.model === NETWORK_VOICE_AUTO_MODEL

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
    <>
      <div class="task-model-item">
        <span data-tip={t('voice-tts-tip')}>{t('voice-tts-heading')}</span>
        <div class="task-model-fields">
          <div class="task-model-field">
            <select
              value={
                isTtsNetworkAuto
                  ? '__network__'
                  : matchedTtsPreset
                    ? matchedTtsPreset.id
                    : ttsSettings.model.trim() && ttsSettings.model !== NETWORK_VOICE_AUTO_MODEL
                      ? '__current__'
                      : ''
              }
              onChange={(event) => {
                const value = event.currentTarget.value
                if (value === '__current__') return
                if (value === '') {
                  onUpdateTtsSettings({ ...ttsSettings, providerId: undefined, model: '' })
                  return
                }
                if (value === '__network__') {
                  onUpdateTtsSettings({ ...ttsSettings, providerId: networkVoiceProviderId, model: NETWORK_VOICE_AUTO_MODEL })
                  return
                }
                const preset = llmPresets.find((entry) => entry.id === value)
                if (!preset) return
                onUpdateTtsSettings({ ...ttsSettings, providerId: preset.providerId, model: preset.model })
              }}
              aria-label={t('voice-tts-model-label')}
            >
              <option value="">{t('voice-model-browser-option')}</option>
              {networkVoiceProviderId && networkConnected ? (
                <option value="__network__" class="option-network">
                  {t('voice-model-network-auto-option')}
                </option>
              ) : null}
              {ttsSettings.model.trim() && !matchedTtsPreset && !isTtsNetworkAuto ? (
                <option value="__current__">{ttsSettings.model}</option>
              ) : null}
              {llmPresets
                .filter((preset) => networkConnected || !isNetworkPreset(preset))
                .map((preset) => (
                  <option key={preset.id} value={preset.id} class={isNetworkPreset(preset) ? 'option-network' : undefined}>
                    {preset.label || preset.model || preset.id}
                  </option>
                ))}
            </select>
            {networkConnected && (isTtsNetworkAuto || (matchedTtsPreset && isNetworkPreset(matchedTtsPreset))) ? (
              <span class="task-badge task-badge-network">{t('llm-preset-network-badge')}</span>
            ) : null}
          </div>

          {/* Hidden for the auto sentinel too, alongside the browser engine:
              the room's provider applies its own voice, so there's nothing
              here to pick. */}
          {ttsSettings.engine !== 'browser' && ttsSettings.model !== NETWORK_VOICE_AUTO_MODEL ? (
            <div class="task-model-field">
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
            </div>
          ) : null}
        </div>
      </div>
      {ttsSettings.engine === 'api' && !ttsBaseUrl.trim() ? (
        <p class="error-text">{t('voice-connection-unresolved')}</p>
      ) : null}

      <div class="task-model-item">
        <span data-tip={t('voice-stt-tip')}>{t('voice-stt-heading')}</span>
        <div class="task-model-fields">
          <div class="task-model-field">
            <select
              value={
                isSttNetworkAuto
                  ? '__network__'
                  : matchedSttPreset
                    ? matchedSttPreset.id
                    : sttSettings.model.trim() && sttSettings.model !== NETWORK_VOICE_AUTO_MODEL
                      ? '__current__'
                      : ''
              }
              onChange={(event) => {
                const value = event.currentTarget.value
                if (value === '__current__') return
                if (value === '') {
                  onUpdateSttSettings({ ...sttSettings, providerId: undefined, model: '' })
                  return
                }
                if (value === '__network__') {
                  onUpdateSttSettings({ ...sttSettings, providerId: networkVoiceProviderId, model: NETWORK_VOICE_AUTO_MODEL })
                  return
                }
                const preset = llmPresets.find((entry) => entry.id === value)
                if (!preset) return
                onUpdateSttSettings({ ...sttSettings, providerId: preset.providerId, model: preset.model })
              }}
              aria-label={t('voice-stt-model-label')}
            >
              <option value="">{t('voice-model-browser-option')}</option>
              {networkVoiceProviderId && networkConnected ? (
                <option value="__network__" class="option-network">
                  {t('voice-model-network-auto-option')}
                </option>
              ) : null}
              {sttSettings.model.trim() && !matchedSttPreset && !isSttNetworkAuto ? (
                <option value="__current__">{sttSettings.model}</option>
              ) : null}
              {llmPresets
                .filter((preset) => networkConnected || !isNetworkPreset(preset))
                .map((preset) => (
                  <option key={preset.id} value={preset.id} class={isNetworkPreset(preset) ? 'option-network' : undefined}>
                    {preset.label || preset.model || preset.id}
                  </option>
                ))}
            </select>
            {networkConnected && (isSttNetworkAuto || (matchedSttPreset && isNetworkPreset(matchedSttPreset))) ? (
              <span class="task-badge task-badge-network">{t('llm-preset-network-badge')}</span>
            ) : null}
          </div>
        </div>
      </div>
      {sttSettings.engine === 'api' && !sttBaseUrl.trim() ? (
        <p class="error-text">{`${t('voice-connection-unresolved')} ${t('voice-stt-unresolved-fallback')}`}</p>
      ) : null}
      {sttSettings.engine === 'api' && sttBaseUrl.trim() && !sttSettings.model.trim() ? (
        <p class="error-text">{`${t('voice-stt-model-missing')} ${t('voice-stt-unresolved-fallback')}`}</p>
      ) : null}

      {enumerationSupported ? (
        <div class="task-model-item">
          <span>{t('voice-mic-label')}</span>
          <div class="task-model-fields">
            <div class="task-model-field">
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
            </div>
          </div>
        </div>
      ) : null}
      {labelsHidden ? (
        <p class="hint">
          {t('voice-mic-permission-hint')}
          <button type="button" class="link-button" onClick={() => void unlockLabels()}>
            {t('voice-mic-permission-button')}
          </button>
        </p>
      ) : null}
    </>
  )
}
