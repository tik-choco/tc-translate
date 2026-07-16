import { Plus, RefreshCw, X } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useRef, useState } from 'preact/hooks'
import { languageOptions } from '../constants'
import { useDraftField } from '../hooks/useDraftField'
import { t } from '../i18n'
import { normalizeBaseUrl } from '../lib/format'
import { languageOptionLabel } from '../lib/language'
import type { ConsumerStatus, ProviderLogEntry } from '@tik-choco/mistai'
import type { LlmProviderV1, ModelPresetV1 } from '../lib/llmConfig'
import type { NetworkProviderPeer, NetworkProviderStatus } from '../hooks/useNetworkProvider'
import type { ModelStatus, ProviderSettings, SttSettings, TtsSettings } from '../types'
import { LlmPresetCard } from './LlmPresetCard'
import { LlmProviderCard } from './LlmProviderCard'
import { NetworkConsumerIndicator, NetworkProviderStatusPanel } from './NetworkStatusPanel'
import { VoiceSettingsPanel } from './VoiceSettingsPanel'

type SettingsModalProps = {
  nativeLanguage: string
  onUpdateNativeLanguage: (next: string) => void
  settings: ProviderSettings
  onUpdateSettings: (next: ProviderSettings) => void
  onClose: () => void
  selectableModelOptions: string[]
  modelStatus: ModelStatus
  modelOptions: string[]
  modelError: string
  onRefreshModels: () => void
  onAddProvider: (label: string) => void
  onUpdateProvider: (id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>) => void
  onRemoveProvider: (id: string) => void
  onAddPreset: (providerId: string, label: string) => void
  onUpdatePreset: (id: string, patch: Partial<Omit<ModelPresetV1, 'id'>>) => void
  onRemovePreset: (id: string) => void
  onSetDefaultPresetId: (id: string) => void
  onSetVisionPresetId: (id: string) => void
  onSetOrchestratorPresetId: (id: string) => void
  onSetWorkerPresetId: (id: string) => void
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

const modelSuggestionsListId = 'tc-model-suggestions'

export const SettingsModal = memo(function SettingsModal({
  nativeLanguage,
  onUpdateNativeLanguage,
  settings,
  onUpdateSettings,
  onClose,
  selectableModelOptions,
  modelStatus,
  modelOptions,
  modelError,
  onRefreshModels,
  onAddProvider,
  onUpdateProvider,
  onRemoveProvider,
  onAddPreset,
  onUpdatePreset,
  onRemovePreset,
  onSetDefaultPresetId,
  onSetVisionPresetId,
  onSetOrchestratorPresetId,
  onSetWorkerPresetId,
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

  const roomIdField = useDraftField(settings.roomId, (next) => onUpdateSettings({ ...settings, roomId: next }))

  function handleOverlayMouseDown(event: MouseEvent): void {
    overlayPressStarted.current = event.target === event.currentTarget
  }

  function handleOverlayClick(event: MouseEvent): void {
    const shouldClose = overlayPressStarted.current && event.target === event.currentTarget
    overlayPressStarted.current = false
    if (shouldClose) onClose()
  }

  function handleDeleteProvider(id: string): void {
    const presetsUsing = settings.presets.filter((preset) => preset.providerId === id).length
    const voiceUsing = (ttsSettings.providerId === id ? 1 : 0) + (sttSettings.providerId === id ? 1 : 0)
    if (presetsUsing + voiceUsing > 0) {
      const ok = window.confirm(t('llm-connection-delete-confirm', { count: presetsUsing + voiceUsing }))
      if (!ok) return
    }
    onRemoveProvider(id)
  }

  function handleDeletePreset(id: string): void {
    const ok = window.confirm(t('llm-preset-delete-confirm'))
    if (!ok) return
    onRemovePreset(id)
    if (settings.visionPresetId === id) onSetVisionPresetId('')
    if (settings.orchestratorPresetId === id) onSetOrchestratorPresetId('')
    if (settings.workerPresetId === id) onSetWorkerPresetId('')
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
            <datalist id={modelSuggestionsListId}>
              {selectableModelOptions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>

            <div class="settings-heading-row">
              <h2 class="settings-section-title">{t('llm-connections-heading')}</h2>
              <button
                type="button"
                class="secondary-button"
                onClick={() => onAddProvider(t('llm-new-connection-label'))}
              >
                <Plus size={16} />
                {t('llm-add')}
              </button>
            </div>
            <p class="hint">{t('llm-connections-hint')}</p>
            <div class="settings-card-list">
              {settings.providers.map((provider) => (
                <LlmProviderCard
                  key={provider.id}
                  provider={provider}
                  onUpdate={onUpdateProvider}
                  onDelete={handleDeleteProvider}
                />
              ))}
              {settings.providers.length === 0 ? <p class="hint">{t('llm-no-connections-hint')}</p> : null}
            </div>

            <div class="settings-heading-row">
              <h2 class="settings-section-title">{t('llm-presets-heading')}</h2>
              <button
                type="button"
                class="secondary-button"
                disabled={settings.providers.length === 0}
                onClick={() => onAddPreset(settings.providers[0].id, t('llm-new-preset-label'))}
              >
                <Plus size={16} />
                {t('llm-add')}
              </button>
            </div>
            <p class="hint">{t('llm-presets-hint')}</p>

            <label>
              <span>{t('llm-default-preset-label')}</span>
              <div class="model-control">
                <select
                  value={settings.defaultPresetId}
                  onChange={(event) => onSetDefaultPresetId(event.currentTarget.value)}
                  aria-label={t('llm-default-preset-label')}
                >
                  <option value="">{t('llm-preset-unset-option')}</option>
                  {settings.presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label || preset.id}
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
            <p class="hint">{t('llm-default-preset-hint')}</p>

            <div class="settings-card-list">
              {settings.presets.map((preset) => (
                <LlmPresetCard
                  key={preset.id}
                  preset={preset}
                  providers={settings.providers}
                  isDefault={preset.id === settings.defaultPresetId}
                  modelListId={modelSuggestionsListId}
                  onUpdate={onUpdatePreset}
                  onDelete={handleDeletePreset}
                />
              ))}
              {settings.presets.length === 0 ? <p class="hint">{t('llm-no-presets-hint')}</p> : null}
            </div>

            <div class="settings-heading-row">
              <h2 class="settings-section-title">{t('llm-roles-heading')}</h2>
            </div>
            <label>
              <span>{t('llm-role-vision-label')}</span>
              <select
                value={settings.visionPresetId}
                onChange={(event) => onSetVisionPresetId(event.currentTarget.value)}
                aria-label={t('llm-role-vision-label')}
              >
                <option value="">{t('llm-role-same-as-default')}</option>
                {settings.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label || preset.id}
                  </option>
                ))}
              </select>
              <span class="model-status">{t('llm-role-current-model', { model: settings.visionModel })}</span>
            </label>

            <label>
              <span>{t('llm-role-orchestrator-label')}</span>
              <select
                value={settings.orchestratorPresetId}
                onChange={(event) => onSetOrchestratorPresetId(event.currentTarget.value)}
                aria-label={t('llm-role-orchestrator-label')}
              >
                <option value="">{t('llm-role-same-as-default')}</option>
                {settings.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label || preset.id}
                  </option>
                ))}
              </select>
              <span class="model-status">{t('llm-role-current-model', { model: settings.orchestratorModel })}</span>
            </label>
            <p class="hint">{t('orchestrator-model-hint')}</p>

            <label>
              <span>{t('llm-role-worker-label')}</span>
              <select
                value={settings.workerPresetId}
                onChange={(event) => onSetWorkerPresetId(event.currentTarget.value)}
                aria-label={t('llm-role-worker-label')}
              >
                <option value="">{t('llm-role-same-as-default')}</option>
                {settings.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label || preset.id}
                  </option>
                ))}
              </select>
              <span class="model-status">{t('llm-role-current-model', { model: settings.workerModel })}</span>
            </label>
            <p class="hint">{t('worker-model-hint')}</p>
            <p class="hint">{t('simul-model-hint')}</p>
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
