import { RefreshCw, X } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { languageOptions } from '../constants'
import { t } from '../i18n'
import { normalizeBaseUrl } from '../lib/format'
import { languageOptionLabel } from '../lib/language'
import type { ConsumerStatus, ProviderLogEntry } from '@tik-choco/mistai'
import type { LlmProviderV1 } from '../lib/llmConfig'
import type { NetworkProviderPeer, NetworkProviderStatus } from '../hooks/useNetworkProvider'
import type { ModelStatus, ProviderSettings, SttSettings, TtsSettings } from '../types'
import { NetworkConsumerIndicator, NetworkProviderStatusPanel } from './NetworkStatusPanel'
import { VoiceSettingsPanel } from './VoiceSettingsPanel'

type SettingsModalProps = {
  nativeLanguage: string
  onUpdateNativeLanguage: (next: string) => void
  settings: ProviderSettings
  onUpdateSettings: (next: ProviderSettings) => void
  onClose: () => void
  selectableModelOptions: string[]
  selectableVisionModelOptions: string[]
  modelStatus: ModelStatus
  modelOptions: string[]
  modelError: string
  onRefreshModels: () => void
  ttsSettings: TtsSettings
  onUpdateTtsSettings: (next: TtsSettings) => void
  sttSettings: SttSettings
  onUpdateSttSettings: (next: SttSettings) => void
  /** Providers in the shared llm config, for the TTS/STT "provider" picker. */
  llmProviders: LlmProviderV1[]
  networkConsumerStatus: ConsumerStatus
  networkConsumerUpdatedAt: number
  networkProviderStatus: NetworkProviderStatus
  networkProviderStatusUpdatedAt: number
  networkProviderError: string
  networkProviderOwnNodeId: string
  networkProviderRoomId: string
  networkProviderPeers: NetworkProviderPeer[]
  networkProviderConsumerCount: number
  networkProviderLogs: ProviderLogEntry[]
  networkProviderUpstreamConfigured: boolean
}

type SettingsTab = 'api' | 'voice' | 'network-consumer' | 'network-provider'

const TABS: Array<{ id: SettingsTab; labelKey: string }> = [
  { id: 'api', labelKey: 'settings-tab-api' },
  { id: 'voice', labelKey: 'settings-tab-voice' },
  { id: 'network-consumer', labelKey: 'settings-tab-network-consumer' },
  { id: 'network-provider', labelKey: 'settings-tab-network-provider' },
]

function useDraftField(value: string, commit: (next: string) => void, delay = 400) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const dirtyRef = useRef(false)
  const focusedRef = useRef(false)
  const commitRef = useRef(commit)
  commitRef.current = commit
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!dirtyRef.current && !focusedRef.current) setDraft(value)
  }, [value])

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current)
      if (dirtyRef.current) {
        dirtyRef.current = false
        commitRef.current(draftRef.current)
      }
    }
  }, [])

  function onInput(next: string): void {
    setDraft(next)
    dirtyRef.current = true
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      dirtyRef.current = false
      commitRef.current(next)
    }, delay)
  }

  function onFocus(): void {
    focusedRef.current = true
  }

  function onBlur(): void {
    focusedRef.current = false
    window.clearTimeout(timerRef.current)
    if (dirtyRef.current) {
      dirtyRef.current = false
      commitRef.current(draftRef.current)
    }
  }

  return { draft, onInput, onFocus, onBlur }
}

export const SettingsModal = memo(function SettingsModal({
  nativeLanguage,
  onUpdateNativeLanguage,
  settings,
  onUpdateSettings,
  onClose,
  selectableModelOptions,
  selectableVisionModelOptions,
  modelStatus,
  modelOptions,
  modelError,
  onRefreshModels,
  ttsSettings,
  onUpdateTtsSettings,
  sttSettings,
  onUpdateSttSettings,
  llmProviders,
  networkConsumerStatus,
  networkConsumerUpdatedAt,
  networkProviderStatus,
  networkProviderStatusUpdatedAt,
  networkProviderError,
  networkProviderOwnNodeId,
  networkProviderRoomId,
  networkProviderPeers,
  networkProviderConsumerCount,
  networkProviderLogs,
  networkProviderUpstreamConfigured,
}: SettingsModalProps) {
  const overlayPressStarted = useRef(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('api')

  const baseUrlField = useDraftField(settings.baseUrl, (next) => onUpdateSettings({ ...settings, baseUrl: next }))
  const apiKeyField = useDraftField(settings.apiKey, (next) => onUpdateSettings({ ...settings, apiKey: next }))
  const roomIdField = useDraftField(settings.roomId, (next) => onUpdateSettings({ ...settings, roomId: next }))

  function handleOverlayMouseDown(event: MouseEvent): void {
    overlayPressStarted.current = event.target === event.currentTarget
  }

  function handleOverlayClick(event: MouseEvent): void {
    const shouldClose = overlayPressStarted.current && event.target === event.currentTarget
    overlayPressStarted.current = false
    if (shouldClose) onClose()
  }

  return (
    <div
      class="modal-layer"
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <aside
        class="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div class="modal-heading">
          <h2 id="settings-title">{t('settings-title')}</h2>
          <button
            type="button"
            class="icon-button small"
            onClick={onClose}
            title={t('close-settings')}
            aria-label={t('close-settings')}
          >
            <X size={18} />
          </button>
        </div>

        <label class="ui-language-row">
          <span>{t('ui-language')}</span>
          <select
            value={nativeLanguage}
            onChange={(event) => onUpdateNativeLanguage(event.currentTarget.value)}
            aria-label={t('ui-language')}
          >
            {languageOptions.map((language) => (
              <option key={language} value={language}>
                {languageOptionLabel(language)}
              </option>
            ))}
          </select>
        </label>
        <p class="hint">{t('ui-language-hint')}</p>

        <div class="settings-tab-bar" role="tablist" aria-label={t('settings-tabs')}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              class={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {activeTab === 'api' ? (
          <div class="settings-tab-panel" role="tabpanel">
            <label>
              <span>Base URL</span>
              <input
                value={baseUrlField.draft}
                onInput={(event) => baseUrlField.onInput(event.currentTarget.value)}
                onFocus={baseUrlField.onFocus}
                onBlur={baseUrlField.onBlur}
                placeholder="https://api.openai.com/v1"
              />
            </label>

            <label>
              <span>API key</span>
              <input
                type="password"
                value={apiKeyField.draft}
                onInput={(event) => apiKeyField.onInput(event.currentTarget.value)}
                onFocus={apiKeyField.onFocus}
                onBlur={apiKeyField.onBlur}
                placeholder={t('api-key-placeholder')}
                autocomplete="off"
              />
            </label>
            <p class="hint">{t('api-hint')}</p>

            <label>
              <span>Model</span>
              <div class="model-control">
                <select
                  value={settings.model}
                  onChange={(event) => onUpdateSettings({ ...settings, model: event.currentTarget.value })}
                  aria-label={t('model-list')}
                >
                  {selectableModelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  class={`icon-button ${modelStatus === 'loading' ? 'loading' : ''}`}
                  onClick={onRefreshModels}
                  disabled={!normalizeBaseUrl(settings.baseUrl) || modelStatus === 'loading'}
                  title={t('refresh-models')}
                  aria-label={t('refresh-models')}
                >
                  <RefreshCw size={18} />
                </button>
              </div>
              <span class="model-status">
                {modelStatus === 'loading'
                  ? t('loading-models')
                  : modelStatus === 'done'
                    ? t('models-loaded', { count: modelOptions.length })
                    : modelError || t('fallback-models')}
              </span>
            </label>

            <label>
              <span>Vision model</span>
              <select
                value={settings.visionModel}
                onChange={(event) => onUpdateSettings({ ...settings, visionModel: event.currentTarget.value })}
                aria-label={t('vision-model-list')}
              >
                {selectableVisionModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {activeTab === 'voice' ? (
          <VoiceSettingsPanel
            ttsSettings={ttsSettings}
            onUpdateTtsSettings={onUpdateTtsSettings}
            sttSettings={sttSettings}
            onUpdateSttSettings={onUpdateSttSettings}
            llmProviders={llmProviders}
          />
        ) : null}

        {activeTab === 'network-consumer' ? (
          <div class="settings-tab-panel" role="tabpanel">
            <p class="hint">{t('network-consumer-hint')}</p>
            <div class="settings-role-card">
              <label class="settings-role-head">
                <input
                  type="checkbox"
                  checked={settings.connection === 'network'}
                  onChange={(event) =>
                    onUpdateSettings({
                      ...settings,
                      connection: event.currentTarget.checked ? 'network' : 'api',
                    })
                  }
                />
                <span class="settings-role-title">{t('network-consumer-toggle')}</span>
              </label>
              {settings.connection === 'network' ? (
                <div class="settings-role-body">
                  <label>
                    <span>Room ID</span>
                    <input
                      value={roomIdField.draft}
                      onInput={(event) => roomIdField.onInput(event.currentTarget.value)}
                      onFocus={roomIdField.onFocus}
                      onBlur={roomIdField.onBlur}
                      placeholder={t('room-id-consumer-placeholder')}
                    />
                  </label>
                  <NetworkConsumerIndicator
                    status={networkConsumerStatus}
                    updatedAt={networkConsumerUpdatedAt}
                    variant="detailed"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'network-provider' ? (
          <div class="settings-tab-panel" role="tabpanel">
            <p class="hint">{t('network-provider-hint')}</p>
            <div class="settings-role-card">
              <label class="settings-role-head">
                <input
                  type="checkbox"
                  checked={settings.networkProviderEnabled}
                  onChange={(event) =>
                    onUpdateSettings({ ...settings, networkProviderEnabled: event.currentTarget.checked })
                  }
                />
                <span class="settings-role-title">{t('network-provider-toggle')}</span>
              </label>
              {settings.networkProviderEnabled ? (
                <div class="settings-role-body">
                  <label>
                    <span>Room ID</span>
                    <input
                      value={roomIdField.draft}
                      onInput={(event) => roomIdField.onInput(event.currentTarget.value)}
                      onFocus={roomIdField.onFocus}
                      onBlur={roomIdField.onBlur}
                      placeholder={t('room-id-provider-placeholder')}
                    />
                  </label>
                  <NetworkProviderStatusPanel
                    providerStatus={networkProviderStatus}
                    providerStatusUpdatedAt={networkProviderStatusUpdatedAt}
                    providerError={networkProviderError}
                    ownNodeId={networkProviderOwnNodeId}
                    roomId={networkProviderRoomId}
                    peers={networkProviderPeers}
                    consumerCount={networkProviderConsumerCount}
                    logs={networkProviderLogs}
                    upstreamConfigured={networkProviderUpstreamConfigured}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  )
})
