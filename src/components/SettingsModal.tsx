import { Network, Plus, Server, X } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { languageOptions, reasoningEffortOptions } from '../constants'
import { useDraftField } from '../hooks/useDraftField'
import { t } from '../i18n'
import { fetchModelIds } from '../lib/api'
import { languageOptionLabel } from '../lib/language'
import { isNetworkProviderBaseUrl } from '../lib/networkModels'
import type { ConsumerStatus, ProviderLogEntry } from '@tik-choco/mistai'
import type { LlmProviderV1, ModelPresetV1 } from '../lib/llmConfig'
import type { NetworkProviderPeer, NetworkProviderStatus } from '../hooks/useNetworkProvider'
import type { ProviderSettings, ReasoningEffort, ReasoningTask, SttSettings, TtsSettings } from '../types'
import { NetworkConsumerIndicator, NetworkProviderStatusPanel } from './NetworkStatusPanel'
import { VoiceTaskRows } from './VoiceSettingsPanel'

type SettingsModalProps = {
  nativeLanguage: string
  onUpdateNativeLanguage: (next: string) => void
  settings: ProviderSettings
  onUpdateSettings: (next: ProviderSettings) => void
  onClose: () => void
  onAddProvider: (label: string, patch?: Partial<Omit<LlmProviderV1, 'id'>>) => void
  onUpdateProvider: (id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>) => void
  onRemoveProvider: (id: string) => void
  onAddPreset: (providerId: string, label: string, patch?: Partial<Omit<ModelPresetV1, 'id'>>) => void
  onUpdatePreset: (id: string, patch: Partial<Omit<ModelPresetV1, 'id'>>) => void
  onRemovePreset: (id: string) => void
  onSetDefaultPresetId: (id: string) => void
  onSetVisionPresetId: (id: string) => void
  onSetReasoningEffort: (task: ReasoningTask, effort: ReasoningEffort) => void
  onSetNetworkProviderPresetIds: (ids: string[]) => void
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

type SettingsTab = 'connection' | 'network' | 'tasks'

const TABS: Array<{ id: SettingsTab; labelKey: string }> = [
  { id: 'connection', labelKey: 'settings-tab-connection' },
  { id: 'network', labelKey: 'settings-tab-network' },
  { id: 'tasks', labelKey: 'settings-tab-tasks' },
]

function getHostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl
  } catch {
    return baseUrl
  }
}

export const SettingsModal = memo(function SettingsModal({
  nativeLanguage,
  onUpdateNativeLanguage,
  settings,
  onUpdateSettings,
  onClose,
  onAddProvider,
  onUpdateProvider,
  onRemoveProvider,
  onAddPreset,
  onUpdatePreset,
  onRemovePreset,
  onSetDefaultPresetId,
  onSetVisionPresetId,
  onSetReasoningEffort,
  onSetNetworkProviderPresetIds,
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('connection')

  const roomIdField = useDraftField(settings.roomId, (next) => onUpdateSettings({ ...settings, roomId: next }))

  // providerId -> fetched models, used by both the 接続先 edit row (as a
  // connection-test side effect) and the モデル section's select/manual
  // fallback. Populated lazily: fetched the first time a row referencing that
  // provider is opened, and invalidated+refetched when the provider's
  // baseUrl/apiKey is committed.
  const [modelsByProviderId, setModelsByProviderId] = useState<Record<string, string[]>>({})
  const [loadingProviderId, setLoadingProviderId] = useState('')
  // providerId -> error message (set when a fetch throws or returns 0 models).
  const [providerModelErrors, setProviderModelErrors] = useState<Record<string, string>>({})

  // --- 接続先 (provider) section: a flat list independent of the モデル
  // section below. Only one inline row (edit or add) is open at a time. ---
  const [editingProviderId, setEditingProviderId] = useState('')
  const [addingProvider, setAddingProvider] = useState(false)
  const [npLabel, setNpLabel] = useState('')
  const [npBaseUrl, setNpBaseUrl] = useState('')
  const [npApiKey, setNpApiKey] = useState('')

  // --- モデル (preset) section: also flat, not grouped/nested under provider. ---
  const [addingModel, setAddingModel] = useState(false)
  const [amLabel, setAmLabel] = useState('')
  const [amProviderId, setAmProviderId] = useState('')
  const [amModel, setAmModel] = useState('')

  const [editingPresetId, setEditingPresetId] = useState('')
  const [epLabel, setEpLabel] = useState('')
  const [epProviderId, setEpProviderId] = useState('')
  const [epModel, setEpModel] = useState('')
  const [epTemperature, setEpTemperature] = useState('')

  // providerId -> generation counter for the most recent fetchProviderModels()
  // call. Guards against a slow, stale fetch (e.g. for a provider whose
  // baseUrl changed again while the first request was in flight) overwriting
  // a newer result. A ref, not state, since bumping it should never itself
  // trigger a re-render.
  const providerFetchGenerationRef = useRef<Map<string, number>>(new Map())

  // Only one inline row (provider edit/add, preset edit/add) is ever open at
  // once; closing handlers all funnel through here.
  function closeAllInlineRows(): void {
    setEditingProviderId('')
    setAddingProvider(false)
    setEditingPresetId('')
    setAddingModel(false)
  }

  // If the entity currently being edited disappears (e.g. removed from
  // another tab/app via the shared config), close its inline row instead of
  // leaving it editing a value that no longer exists.
  useEffect(() => {
    if (editingProviderId && !settings.providers.some((provider) => provider.id === editingProviderId)) {
      setEditingProviderId('')
    }
    if (editingPresetId && !settings.presets.some((preset) => preset.id === editingPresetId)) {
      setEditingPresetId('')
    }
  }, [settings.providers, settings.presets])

  // Every inline row commits on selection/blur rather than an explicit
  // "決定" button, so the only remaining way to close a row that's just had
  // its label tweaked is clicking outside it (or Escape). Attached with a
  // ref (activeRowRef) to whichever row is currently open, since at most one
  // can be open at a time.
  //
  // The mousedown-before-click ordering below guards against a specific
  // misfire: dragging to select text inside a row's input, releasing the
  // mouse button outside the row, produces a `click` event whose `target` is
  // computed from the mouseup position - the browser can resolve it to an
  // ancestor outside the row even though the drag started inside it. Without
  // this guard that stray click would be read as "clicked outside" and close
  // the row mid-selection. Recording where the mousedown landed and ignoring
  // the click when it started inside fixes this while still closing on a
  // genuine outside click.
  const activeRowRef = useRef<HTMLDivElement | null>(null)
  const mouseDownInsideRef = useRef(false)
  useEffect(() => {
    if (!editingProviderId && !addingProvider && !editingPresetId && !addingModel) return undefined

    function handleDocumentMouseDown(event: MouseEvent): void {
      mouseDownInsideRef.current = Boolean(
        activeRowRef.current && activeRowRef.current.contains(event.target as Node),
      )
    }
    function handleDocumentClick(event: MouseEvent): void {
      if (activeRowRef.current && activeRowRef.current.contains(event.target as Node)) return
      if (mouseDownInsideRef.current) return
      closeAllInlineRows()
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeAllInlineRows()
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [editingProviderId, addingProvider, editingPresetId, addingModel])

  // Fetches a provider's model list. Doubles as a lightweight connection
  // test (there's no separate "test connection" button): an empty result is
  // treated as failure and surfaces llm-model-fetch-error. Stale responses
  // (a newer fetch for the same provider started before this one resolved)
  // are discarded rather than overwriting a fresher result.
  async function fetchProviderModels(provider: LlmProviderV1): Promise<string[]> {
    const generations = providerFetchGenerationRef.current
    const myGeneration = (generations.get(provider.id) || 0) + 1
    generations.set(provider.id, myGeneration)
    const isStale = () => generations.get(provider.id) !== myGeneration

    setLoadingProviderId(provider.id)
    setProviderModelErrors((current) => ({ ...current, [provider.id]: '' }))

    let models: string[] = []
    try {
      models = await fetchModelIds({ baseUrl: provider.baseUrl, apiKey: provider.apiKey })
    } catch {
      models = []
    }

    if (isStale()) return models
    setModelsByProviderId((current) => ({ ...current, [provider.id]: models }))
    if (models.length === 0) {
      setProviderModelErrors((current) => ({ ...current, [provider.id]: t('llm-model-fetch-error') }))
    }
    setLoadingProviderId((current) => (current === provider.id ? '' : current))
    return models
  }

  // Called whenever a row's provider selection settles on `providerId`.
  // `force` re-fetches even if a cached result exists (used when switching
  // to a different provider, whose models the cache can't be trusted for).
  //
  // The AI接続 tab manages HTTP providers/presets regardless of which
  // transport (`settings.connection`) the AI Network tab has selected - STT/
  // TTS and the network-provider upstream resolve against them either way -
  // so the only thing that skips a fetch here is the provider itself being
  // the `mist-network://` pseudo-provider, which has no HTTP model list.
  function ensureProviderModelsFetched(providerId: string, options: { force?: boolean } = {}): void {
    if (!providerId) return
    if (!options.force && modelsByProviderId[providerId] !== undefined) return
    const provider = settings.providers.find((entry) => entry.id === providerId)
    if (!provider || isNetworkProviderBaseUrl(provider.baseUrl)) return
    void fetchProviderModels(provider)
  }

  // While a fetch is in flight (or hasn't run yet but has 0 cached models),
  // the model field stays a <select> showing a loading placeholder; once a
  // fetch resolves with 0 models it falls back to manual text entry.
  function getModelSelectionState(providerId: string): { isLoading: boolean; models: string[]; mode: 'select' | 'manual' } {
    const isLoading = loadingProviderId === providerId
    const models = modelsByProviderId[providerId] || []
    return { isLoading, models, mode: isLoading || models.length > 0 ? 'select' : 'manual' }
  }

  function getProviderLabel(providerId: string): string {
    const provider = settings.providers.find((entry) => entry.id === providerId)
    if (!provider) return t('llm-preset-unknown-connection')
    return provider.label || getHostLabel(provider.baseUrl)
  }

  // True when `providerId` resolves to the `mist-network://` pseudo-provider
  // (a model discovered via the AI Network room), as opposed to a regular
  // HTTP connection the user configured directly.
  function isNetworkPresetProvider(providerId: string): boolean {
    const provider = settings.providers.find((entry) => entry.id === providerId)
    return provider ? isNetworkProviderBaseUrl(provider.baseUrl) : false
  }

  function getPresetBadges(preset: ModelPresetV1): string[] {
    const badges: string[] = []
    if (settings.defaultPresetId === preset.id) badges.push(t('llm-preset-default-badge'))
    if (settings.visionPresetId === preset.id) badges.push(t('llm-task-badge-vision'))
    if (isNetworkPresetProvider(preset.providerId)) badges.push(t('llm-preset-network-badge'))
    if (settings.networkProviderPresetIds.includes(preset.id)) badges.push(t('llm-preset-shared-badge'))
    return badges
  }

  // --- AI Network (network tab) handlers ------------------------------------

  // Toggles a preset's membership in the set of presets advertised to the AI
  // Network room (settings.networkProviderPresetIds), preserving order.
  function handleToggleShareModel(presetId: string, checked: boolean): void {
    const current = settings.networkProviderPresetIds
    const next = checked ? [...current, presetId] : current.filter((id) => id !== presetId)
    onSetNetworkProviderPresetIds(next)
  }

  function handleOverlayMouseDown(event: MouseEvent): void {
    overlayPressStarted.current = event.target === event.currentTarget
  }

  function handleOverlayClick(event: MouseEvent): void {
    const shouldClose = overlayPressStarted.current && event.target === event.currentTarget
    overlayPressStarted.current = false
    if (shouldClose) onClose()
  }

  // --- 接続先 (provider) handlers ------------------------------------------

  function handleOpenEditProvider(provider: LlmProviderV1): void {
    closeAllInlineRows()
    setEditingProviderId(provider.id)
  }

  // No explicit commit button: each field commits on blur, and the row stays
  // open (closing is left to the outside-click/Escape handler above) so a
  // user can tab between label/Base URL/API key without the row vanishing.
  function handleUpdateProviderField(id: string, field: 'label' | 'baseUrl' | 'apiKey', value: string): void {
    if (field === 'baseUrl' && !value.trim()) return
    onUpdateProvider(id, { [field]: value })
    // Connection info changed, so any cached model list for this provider is
    // no longer trustworthy - drop it and refetch immediately.
    if (field === 'baseUrl' || field === 'apiKey') {
      setModelsByProviderId((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      const provider = settings.providers.find((entry) => entry.id === id)
      const nextBaseUrl = field === 'baseUrl' ? value : provider?.baseUrl ?? ''
      if (provider && !isNetworkProviderBaseUrl(nextBaseUrl)) void fetchProviderModels({ ...provider, [field]: value })
    }
  }

  function handleOpenAddProvider(): void {
    closeAllInlineRows()
    setAddingProvider(true)
    setNpLabel('')
    setNpBaseUrl('')
    setNpApiKey('')
  }

  function handleCancelAddProvider(): void {
    setAddingProvider(false)
  }

  // Unlike the モデル add form (select = commit), this is a free-form
  // multi-field form with no single discrete "selection" event, so it keeps
  // an explicit Add/Cancel pair.
  function handleSaveNewProvider(): void {
    const baseUrl = npBaseUrl.trim().replace(/\/$/, '')
    if (!baseUrl) return
    onAddProvider(npLabel.trim(), { baseUrl, apiKey: npApiKey })
    setAddingProvider(false)
  }

  function handleRemoveProviderRow(provider: LlmProviderV1): void {
    const presetsUsing = settings.presets.filter((preset) => preset.providerId === provider.id).length
    const voiceUsing = (ttsSettings.providerId === provider.id ? 1 : 0) + (sttSettings.providerId === provider.id ? 1 : 0)
    if (presetsUsing + voiceUsing > 0) {
      const ok = window.confirm(t('llm-connection-delete-confirm', { count: presetsUsing + voiceUsing }))
      if (!ok) return
    }
    onRemoveProvider(provider.id)
    setModelsByProviderId((current) => {
      const next = { ...current }
      delete next[provider.id]
      return next
    })
    setProviderModelErrors((current) => {
      const next = { ...current }
      delete next[provider.id]
      return next
    })
    if (editingProviderId === provider.id) setEditingProviderId('')
    if (amProviderId === provider.id) {
      setAddingModel(false)
      setAmProviderId('')
      setAmModel('')
    }
    if (epProviderId === provider.id && editingPresetId) {
      setEditingPresetId('')
    }
  }

  // --- モデル (preset) handlers ---------------------------------------------

  function handleOpenAddModel(): void {
    closeAllInlineRows()
    setAddingModel(true)
    setAmLabel('')
    setAmProviderId('')
    setAmModel('')
  }

  function handleCancelAddModel(): void {
    setAddingModel(false)
  }

  function handleAmProviderChange(providerId: string): void {
    setAmProviderId(providerId)
    setAmModel('')
    ensureProviderModelsFetched(providerId, { force: true })
  }

  // Selection = commit: there's no Add button, so both the model <select>'s
  // onChange and the manual <input>'s blur/Enter call this directly.
  // `modelOverride` is used by the select's onChange, since setAmModel(value)
  // is async and reading amModel synchronously right after would still see
  // the old value.
  function handleSaveAddModel(modelOverride?: string): void {
    const model = (modelOverride ?? amModel).trim()
    if (!amProviderId || !model) return
    if (!settings.providers.some((provider) => provider.id === amProviderId)) {
      setProviderModelErrors((current) => ({ ...current, [amProviderId]: t('llm-model-fetch-error') }))
      return
    }
    onAddPreset(amProviderId, amLabel.trim() || model, { model })
    setAddingModel(false)
  }

  function handleAmModelSelectChange(value: string): void {
    setAmModel(value)
    handleSaveAddModel(value)
  }

  function handleOpenEditPreset(preset: ModelPresetV1): void {
    closeAllInlineRows()
    setEditingPresetId(preset.id)
    setEpLabel(preset.label)
    setEpProviderId(preset.providerId)
    setEpModel(preset.model)
    setEpTemperature(String(preset.temperature ?? 0.7))
    ensureProviderModelsFetched(preset.providerId)
  }

  // Label doesn't close the row on blur - it's meant to be tweaked in
  // passing while moving on to other fields, with the outside-click handler
  // closing the row once the user is actually done.
  function handleEpLabelBlur(preset: ModelPresetV1): void {
    const label = epLabel.trim() || preset.model
    if (label !== preset.label) onUpdatePreset(preset.id, { label })
  }

  // Switching providers commits the new providerId immediately but leaves the
  // stored model untouched until a new one is picked - only the local model
  // selection resets (a model name from the old provider is meaningless in
  // the new provider's list), so switching back loses nothing.
  function handleEpProviderChange(preset: ModelPresetV1, providerId: string): void {
    setEpProviderId(providerId)
    setEpModel('')
    onUpdatePreset(preset.id, { providerId })
    ensureProviderModelsFetched(providerId, { force: true })
  }

  function handleEpModelSelectChange(preset: ModelPresetV1, value: string): void {
    setEpModel(value)
    if (settings.providers.some((provider) => provider.id === epProviderId)) {
      onUpdatePreset(preset.id, { model: value })
    }
    setEditingPresetId('')
  }

  function handleEpModelManualBlur(preset: ModelPresetV1): void {
    const model = epModel.trim()
    if (model && model !== preset.model && settings.providers.some((provider) => provider.id === epProviderId)) {
      onUpdatePreset(preset.id, { model })
    }
    setEditingPresetId('')
  }

  function handleEpTemperatureBlur(preset: ModelPresetV1): void {
    const parsed = Number(epTemperature)
    if (Number.isFinite(parsed) && parsed !== (preset.temperature ?? 0.7)) {
      onUpdatePreset(preset.id, { temperature: parsed })
    }
  }

  function handleRemovePresetRow(id: string): void {
    const ok = window.confirm(t('llm-preset-delete-confirm'))
    if (!ok) return
    onRemovePreset(id)
    if (settings.visionPresetId === id) onSetVisionPresetId('')
    if (editingPresetId === id) setEditingPresetId('')
  }

  // --- 接続先 (provider) row rendering --------------------------------------

  function renderProviderRow(provider: LlmProviderV1) {
    const isEditing = editingProviderId === provider.id
    const isNetworkProvider = isNetworkProviderBaseUrl(provider.baseUrl)
    const hostLabel = getHostLabel(provider.baseUrl)
    // The raw `mist-network://<room>` host is meaningless to a user - show
    // a translated note instead, same idea as the badge on network presets.
    const secondLine = isNetworkProvider ? t('llm-connection-network-note') : hostLabel

    if (isEditing) {
      return (
        <div class="model-row model-row-editing" key={provider.id} ref={activeRowRef}>
          <div class="model-row-edit-fields">
            <input
              value={provider.label}
              onBlur={(event) => handleUpdateProviderField(provider.id, 'label', event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              placeholder={t('llm-label-placeholder')}
              autoComplete="off"
            />
            <input
              value={provider.baseUrl}
              title={provider.baseUrl}
              onBlur={(event) => handleUpdateProviderField(provider.id, 'baseUrl', event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              placeholder="https://..."
              autoComplete="off"
            />
            <input
              type="password"
              value={provider.apiKey || ''}
              onBlur={(event) => handleUpdateProviderField(provider.id, 'apiKey', event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              placeholder={t('api-key-placeholder')}
              autoComplete="off"
            />
            {providerModelErrors[provider.id] ? (
              <p class="hint connection-form-warning">{providerModelErrors[provider.id]}</p>
            ) : null}
          </div>
        </div>
      )
    }

    return (
      <div class={`model-row${isNetworkProvider ? ' model-row-network' : ''}`} key={provider.id}>
        <button type="button" class="model-row-main" onClick={() => handleOpenEditProvider(provider)}>
          <span class="model-row-label">{provider.label || hostLabel}</span>
          <span class="model-row-model">{secondLine}</span>
        </button>
        <span
          class="preset-chip-remove model-row-remove"
          role="button"
          tabIndex={0}
          title={t('llm-connection-delete')}
          onClick={(event) => {
            event.stopPropagation()
            handleRemoveProviderRow(provider)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              handleRemoveProviderRow(provider)
            }
          }}
        >
          <X size={13} />
        </span>
      </div>
    )
  }

  function renderAddProviderRow() {
    return (
      <div class="model-row model-row-editing model-row-add" ref={activeRowRef}>
        <div class="model-row-edit-fields">
          <input
            value={npLabel}
            onInput={(event) => setNpLabel(event.currentTarget.value)}
            placeholder={t('llm-label-placeholder')}
            autoComplete="off"
          />
          <input
            value={npBaseUrl}
            onInput={(event) => setNpBaseUrl(event.currentTarget.value)}
            placeholder="https://..."
            autoComplete="off"
          />
          <input
            type="password"
            value={npApiKey}
            onInput={(event) => setNpApiKey(event.currentTarget.value)}
            placeholder={t('api-key-placeholder')}
            autoComplete="off"
          />
        </div>
        <div class="model-row-add-actions">
          <button
            type="button"
            class="connection-form-btn connection-form-btn-primary"
            onClick={handleSaveNewProvider}
            disabled={!npBaseUrl.trim()}
          >
            <Plus size={13} />
            {t('llm-add')}
          </button>
          <button type="button" class="connection-form-btn" onClick={handleCancelAddProvider}>
            {t('llm-cancel')}
          </button>
        </div>
      </div>
    )
  }

  function renderAddProviderTile() {
    if (addingProvider) return renderAddProviderRow()
    return (
      <button type="button" class="grid-add-tile" onClick={handleOpenAddProvider}>
        <Plus size={16} />
        <span>{t('llm-add-connection-tile')}</span>
      </button>
    )
  }

  // --- モデル (preset) row rendering -----------------------------------------

  function renderModelRow(preset: ModelPresetV1) {
    const isEditing = editingPresetId === preset.id

    if (isEditing) {
      const { mode: epMode, isLoading: epLoading, models: providerModels } = getModelSelectionState(epProviderId)
      const modelError = epProviderId ? providerModelErrors[epProviderId] : ''
      return (
        <div class="model-row model-row-editing" key={preset.id} ref={activeRowRef}>
          <div class="model-row-edit-fields">
            <input
              value={epLabel}
              onInput={(event) => setEpLabel(event.currentTarget.value)}
              onBlur={() => handleEpLabelBlur(preset)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              placeholder={t('llm-label-placeholder')}
              autoComplete="off"
            />
            <select value={epProviderId} onChange={(event) => handleEpProviderChange(preset, event.currentTarget.value)}>
              {settings.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label || getHostLabel(provider.baseUrl)}
                </option>
              ))}
            </select>
            <div class="connection-form-model-field">
              {epMode === 'select' ? (
                <select value={epModel} onChange={(event) => handleEpModelSelectChange(preset, event.currentTarget.value)}>
                  <option value="" disabled>
                    {epLoading ? t('llm-models-loading') : t('llm-select-model-placeholder')}
                  </option>
                  {epModel && !providerModels.includes(epModel) ? <option value={epModel}>{epModel}</option> : null}
                  {providerModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={epModel}
                  onInput={(event) => setEpModel(event.currentTarget.value)}
                  onBlur={() => handleEpModelManualBlur(preset)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                  placeholder={t('llm-model-name-placeholder')}
                  autoComplete="off"
                />
              )}
            </div>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={epTemperature}
              onInput={(event) => setEpTemperature(event.currentTarget.value)}
              onBlur={() => handleEpTemperatureBlur(preset)}
              placeholder={t('llm-preset-temperature-label')}
              aria-label={t('llm-preset-temperature-label')}
              title={t('llm-preset-temperature-label')}
            />
            {modelError ? <p class="hint connection-form-warning">{modelError}</p> : null}
          </div>
        </div>
      )
    }

    const badges = getPresetBadges(preset)
    const isNetworkPreset = isNetworkPresetProvider(preset.providerId)
    return (
      <div class={`model-row${isNetworkPreset ? ' model-row-network' : ''}`} key={preset.id}>
        <button type="button" class="model-row-main" onClick={() => handleOpenEditPreset(preset)}>
          <span class="model-row-label">{preset.label}</span>
          <span class="model-row-model">{preset.model}</span>
          <span class="model-row-provider">{getProviderLabel(preset.providerId)}</span>
        </button>
        {badges.length > 0 ? (
          <span class="model-row-badges">
            {badges.map((badge) => (
              <span key={badge} class="task-badge">
                {badge}
              </span>
            ))}
          </span>
        ) : null}
        <span
          class="preset-chip-remove model-row-remove"
          role="button"
          tabIndex={0}
          title={t('llm-preset-delete')}
          onClick={(event) => {
            event.stopPropagation()
            handleRemovePresetRow(preset.id)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              event.stopPropagation()
              handleRemovePresetRow(preset.id)
            }
          }}
        >
          <X size={13} />
        </span>
      </div>
    )
  }

  function renderAddModelRow() {
    const { mode: amMode, isLoading: amLoading, models: providerModels } = getModelSelectionState(amProviderId)
    const modelError = amProviderId ? providerModelErrors[amProviderId] : ''
    return (
      <div class="model-row model-row-editing model-row-add" ref={activeRowRef}>
        <div class="model-row-edit-fields">
          <input
            value={amLabel}
            onInput={(event) => setAmLabel(event.currentTarget.value)}
            placeholder={t('llm-label-placeholder')}
            autoComplete="off"
          />
          <select value={amProviderId} onChange={(event) => handleAmProviderChange(event.currentTarget.value)}>
            <option value="" disabled>
              {t('llm-select-connection-placeholder')}
            </option>
            {settings.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label || getHostLabel(provider.baseUrl)}
              </option>
            ))}
          </select>
          <div class="connection-form-model-field">
            {!amProviderId ? (
              <select value="" disabled>
                <option value="">{t('llm-model-select-connection-first')}</option>
              </select>
            ) : amMode === 'select' ? (
              <select value={amModel} onChange={(event) => handleAmModelSelectChange(event.currentTarget.value)}>
                <option value="" disabled>
                  {amLoading ? t('llm-models-loading') : t('llm-select-model-placeholder')}
                </option>
                {providerModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={amModel}
                onInput={(event) => setAmModel(event.currentTarget.value)}
                onBlur={() => handleSaveAddModel()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                placeholder={t('llm-model-name-placeholder')}
                autoComplete="off"
              />
            )}
          </div>
          {modelError ? <p class="hint connection-form-warning">{modelError}</p> : null}
        </div>
        <div class="model-row-add-actions">
          <button type="button" class="connection-form-btn" onClick={handleCancelAddModel}>
            {t('llm-cancel')}
          </button>
        </div>
      </div>
    )
  }

  function renderAddModelTile() {
    if (settings.providers.length === 0) {
      return (
        <button type="button" class="grid-add-tile" disabled title={t('llm-add-model-need-connection')}>
          <Plus size={16} />
          <span>{t('llm-add-model-tile')}</span>
        </button>
      )
    }
    if (addingModel) return renderAddModelRow()
    return (
      <button type="button" class="grid-add-tile" onClick={handleOpenAddModel}>
        <Plus size={16} />
        <span>{t('llm-add-model-tile')}</span>
      </button>
    )
  }

  // 接続先 and モデル are independent flat grids sharing no header controls
  // beyond the add tile at the end of each grid.
  function renderReasoningEffortSelect(task: ReasoningTask, value: ReasoningEffort) {
    return (
      <div class="task-model-field">
        <select
          value={value}
          onChange={(event) => onSetReasoningEffort(task, event.currentTarget.value as ReasoningEffort)}
          aria-label={t('llm-reasoning-effort-label')}
          title={t('llm-reasoning-effort-label')}
        >
          {reasoningEffortOptions.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      </div>
    )
  }

  function renderDirectApiSection() {
    return (
      <>
        <div class="server-list-header">
          <label>{t('llm-connections-heading')}</label>
        </div>
        <div class="settings-flat-section settings-flat-section-connection">
          {settings.providers.length === 0 && !addingProvider ? <p class="hint">{t('llm-no-connections-hint')}</p> : null}
          <div class="model-row-list">
            {settings.providers.map((provider) => renderProviderRow(provider))}
            {renderAddProviderTile()}
          </div>
        </div>

        <div class="server-list-header">
          <label>{t('llm-presets-heading')}</label>
        </div>
        <div class="settings-flat-section settings-flat-section-models">
          {settings.providers.length > 0 && settings.presets.length === 0 && !addingModel ? (
            <p class="hint">{t('llm-no-models-hint')}</p>
          ) : null}
          <div class="model-row-list">
            {settings.presets.map((preset) => renderModelRow(preset))}
            {renderAddModelTile()}
          </div>
        </div>
      </>
    )
  }

  // Mirrors resolveVoice's fallback (lib/llmConfig.ts): the default preset's
  // provider with no further substitute. settings.baseUrl would paper over an
  // unresolved default preset with the built-in OpenAI URL, hiding the exact
  // state VoiceTaskRows needs to warn about.
  const defaultPreset = settings.presets.find((preset) => preset.id === settings.defaultPresetId)
  const defaultPresetProvider = settings.providers.find((provider) => provider.id === defaultPreset?.providerId)
  const defaultVoiceConnection = {
    baseUrl: defaultPresetProvider?.baseUrl ?? '',
    apiKey: defaultPresetProvider?.apiKey ?? '',
  }

  // Presets shareable to the AI Network room: must resolve to a real HTTP
  // provider - a preset whose provider is itself the `mist-network://`
  // pseudo-provider (i.e. imported from the room) can't be re-shared.
  const eligiblePresets = settings.presets.filter((preset) => {
    const provider = settings.providers.find((entry) => entry.id === preset.providerId)
    return provider !== undefined && !isNetworkProviderBaseUrl(provider.baseUrl)
  })

  // VoiceTaskRows only uses this list to resolve a direct HTTP
  // connection (warnings / TTS voice fetch), so network pseudo-providers are
  // excluded. Network-imported presets themselves ARE selectable in the
  // TTS/STT model pickers (settings.presets, passed below as llmPresets, is
  // unfiltered) and route through the network transport automatically via
  // the derived 'network' engine.
  const voiceLlmProviders = llmProviders.filter((provider) => !isNetworkProviderBaseUrl(provider.baseUrl))

  // The room's mist-network:// pseudo-provider id, '' when none imported yet
  // (no AI Network room joined/consumed). Drives the "AI Networkにおまかせ"
  // option in the TTS/STT model pickers.
  const networkVoiceProviderId = settings.providers.find((provider) => isNetworkProviderBaseUrl(provider.baseUrl))?.id ?? ''

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

        {activeTab === 'connection' ? (
          <div class="settings-tab-panel" role="tabpanel">
            <p class="hint">{t('llm-connections-hint')}</p>

            {/* Providers/presets stay editable regardless of transport: STT/TTS
                and the network-provider upstream resolve against them whether
                the AI Network tab has "Use a network LLM" on or off. */}
            {renderDirectApiSection()}
          </div>
        ) : null}

        {activeTab === 'network' ? (
          <div class="settings-tab-panel" role="tabpanel">
            <p class="hint">{t('network-tab-hint')}</p>

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

            <div class="settings-role-group">
              <div class="settings-role-card">
                <label class="settings-role-head">
                  <input
                    type="checkbox"
                    checked={settings.connection === 'network'}
                    onChange={(event) =>
                      onUpdateSettings({ ...settings, connection: event.currentTarget.checked ? 'network' : 'api' })
                    }
                  />
                  <span class="settings-role-title">
                    <Network size={15} />
                    {t('network-consumer-toggle')}
                  </span>
                </label>
                <p class="settings-role-desc">{t('network-consumer-hint')}</p>
                {settings.connection === 'network' ? (
                  <div class="settings-role-body">
                    <NetworkConsumerIndicator status={networkConsumerStatus} updatedAt={networkConsumerUpdatedAt} variant="detailed" />
                    <p class="settings-role-desc">{t('network-auto-import-hint')}</p>
                  </div>
                ) : null}
              </div>

              <div class="settings-role-card">
                <label class="settings-role-head">
                  <input
                    type="checkbox"
                    checked={settings.networkProviderEnabled}
                    onChange={(event) =>
                      onUpdateSettings({ ...settings, networkProviderEnabled: event.currentTarget.checked })
                    }
                  />
                  <span class="settings-role-title">
                    <Server size={15} />
                    {t('network-provider-toggle')}
                  </span>
                </label>
                <p class="settings-role-desc">{t('network-provider-hint')}</p>
                {settings.networkProviderEnabled ? (
                  <div class="settings-role-body">
                    {/* The what/why of sharing lives in the card's settings-role-desc
                        (network-provider-hint) - repeating it here as another hint
                        paragraph just pushed the list below the fold. */}
                    <div class="network-share-models">
                      <label>{t('network-share-models-heading')}</label>
                      {eligiblePresets.length === 0 ? (
                        <p class="hint">{t('network-share-models-empty')}</p>
                      ) : (
                        <div class="network-share-list">
                          {eligiblePresets.map((preset) => (
                            <label class="network-share-item" key={preset.id}>
                              <input
                                type="checkbox"
                                checked={settings.networkProviderPresetIds.includes(preset.id)}
                                onChange={(event) => handleToggleShareModel(preset.id, event.currentTarget.checked)}
                              />
                              <span class="network-share-item-label">{preset.label || preset.model}</span>
                              <span class="network-share-item-model">
                                {preset.model} · {getProviderLabel(preset.providerId)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
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
          </div>
        ) : null}

        {activeTab === 'tasks' ? (
          <div class="settings-tab-panel" role="tabpanel">
            <div class="task-model-item">
              <span data-tip={t('llm-task-tip-default')}>{t('llm-task-default-label')}</span>
              <div class="task-model-fields">
                <div class="task-model-field">
                  <select
                    value={settings.defaultPresetId}
                    onChange={(event) => onSetDefaultPresetId(event.currentTarget.value)}
                    aria-label={t('llm-task-default-label')}
                  >
                    <option value="">{t('llm-preset-unset-option')}</option>
                    {settings.presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label || preset.id}
                      </option>
                    ))}
                  </select>
                </div>
                {renderReasoningEffortSelect('default', settings.reasoningEffort)}
              </div>
            </div>

            <div class="task-model-item">
              <span data-tip={t('llm-task-tip-vision')}>{t('llm-role-vision-label')}</span>
              <div class="task-model-fields">
                <div class="task-model-field">
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
                </div>
                {renderReasoningEffortSelect('vision', settings.visionReasoningEffort)}
              </div>
            </div>

            <VoiceTaskRows
              ttsSettings={ttsSettings}
              onUpdateTtsSettings={onUpdateTtsSettings}
              sttSettings={sttSettings}
              onUpdateSttSettings={onUpdateSttSettings}
              llmProviders={voiceLlmProviders}
              llmPresets={settings.presets}
              defaultVoiceConnection={defaultVoiceConnection}
              networkVoiceProviderId={networkVoiceProviderId}
            />
          </div>
        ) : null}
      </aside>
    </div>
  )
})
