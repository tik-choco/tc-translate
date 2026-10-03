import { ChevronDown, X } from 'lucide-preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { languageOptions } from '../constants'
import { t } from '../i18n'
import type { LlmProviderV1, ModelRefV1 } from '../lib/llmConfig'
import { revalidateProviderModels } from '../lib/providerModels'
import { isNetworkProviderBaseUrl, networkProviderBaseUrl, roomIdFromBaseUrl } from '../lib/networkModels'
import { languageOptionLabel } from '../lib/language'
import type { ProviderSettings, ReasoningEffort, ReasoningTask, RoomProvide, SttSettings, TtsSettings } from '../types'
import { ModelPicker } from './ModelPicker'
import { ProviderStatus } from './ProviderStatus'
import { SharingPanel } from './SharingPanel'
import { MistBuildBanner } from './MistBuildBanner'
import { useNetworkConsumerStatusWithTimestamp } from '../hooks/useNetworkConsumerStatus'
import { VoiceTaskRows } from './VoiceSettingsPanel'
import { AnimatedDisclosure, motionOptions, useAnimatedItems } from './SettingsMotion'
import { ReasoningPicker } from './ReasoningPicker'
import { AddConnectionPopup } from './AddConnectionPopup'

type SettingsModalProps = {
  nativeLanguage: string; onUpdateNativeLanguage: (next: string) => void; settings: ProviderSettings; onClose: () => void;
  onAddProvider: (label: string, patch?: Partial<Omit<LlmProviderV1, 'id'>>) => string;
  onUpdateProvider: (id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>) => void; onRemoveProvider: (id: string) => void;
  onSetDefaultModel: (ref?: ModelRefV1) => void; onSetTaskRef: (task: ReasoningTask, ref?: ModelRefV1) => void;
  onSetReasoningEffort: (task: ReasoningTask, effort: ReasoningEffort) => void;
  onSetRoomProvide: (id: string, value: RoomProvide) => void; onRememberModel: (ref?: ModelRefV1) => void;
  ttsSettings: TtsSettings; onUpdateTtsSettings: (next: TtsSettings) => void;
  sttSettings: SttSettings; onUpdateSttSettings: (next: SttSettings) => void; onOpenOnboarding: () => void;
}
function ProviderField({ label, value, commit, type = 'text' }: { label: string; value: string; commit: (value: string) => void; type?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <label class="provider-field"><span>{label}</span><input type={type} value={draft} onInput={event => setDraft(event.currentTarget.value)} onBlur={event => commit(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}
function ProviderCard({ provider, props }: { provider: LlmProviderV1; props: SettingsModalProps }) {
  const room = isNetworkProviderBaseUrl(provider.baseUrl)
  const [expanded, setExpanded] = useState(false)
  const { status, updatedAt } = useNetworkConsumerStatusWithTimestamp(room ? roomIdFromBaseUrl(provider.baseUrl) : '')
  useEffect(() => {
    const focus = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== provider.id) return
      setExpanded(true)
      document.querySelector<HTMLButtonElement>(`[data-provider-id="${CSS.escape(provider.id)}"] .provider-card-summary`)?.focus({ preventScroll: true })
    }
    window.addEventListener('tc-focus-provider', focus)
    return () => window.removeEventListener('tc-focus-provider', focus)
  }, [provider.id])
  const update = (patch: Partial<LlmProviderV1>) => props.onUpdateProvider(provider.id, patch)
  function field(label: string, value: string, commit: (value: string) => void, type = 'text') {
    return <ProviderField label={label} value={value} commit={commit} type={type} />
  }
  return <article class={`provider-card ${provider.enabled === false ? 'provider-disabled' : ''}`} data-provider-id={provider.id}>
    <div class="provider-card-heading">
      <button type="button" class="settings-switch" role="switch" aria-checked={provider.enabled !== false} onClick={() => update({ enabled: provider.enabled === false })} aria-label={`${provider.label} ${t('models-enabled')}`} data-tip={t('models-enabled')}><span /></button>
      <button type="button" class="provider-card-summary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span class="provider-kind">{room ? t('connection-room') : 'HTTP'}</span><span class="provider-card-name"><strong title={provider.label || provider.baseUrl}>{provider.label || provider.baseUrl}</strong><span class="provider-card-meta" title={room ? roomIdFromBaseUrl(provider.baseUrl) : provider.baseUrl}>{room ? roomIdFromBaseUrl(provider.baseUrl) : provider.baseUrl}</span></span><ChevronDown size={16} class="disclosure-chevron" />
      </button>
      <ProviderStatus provider={provider} status={status} updatedAt={updatedAt} provide={props.settings.roomProvide[provider.id]?.enabled ?? false} />
    </div>
    <AnimatedDisclosure open={expanded}><div class="provider-card-body">
      {field(t('provider-label'), provider.label, label => update({ label }))}
      {field(room ? t('room-id') : t('connection-base-url'), room ? roomIdFromBaseUrl(provider.baseUrl) : provider.baseUrl, value => update({ baseUrl: room ? networkProviderBaseUrl(value) : value.trim() }))}
      {!room && field(t('connection-api-key'), provider.apiKey, apiKey => update({ apiKey }), 'password')}
      <div class="provider-card-actions"><button type="button" class="danger-button" onClick={() => props.onRemoveProvider(provider.id)}>{t('provider-delete')}</button></div>
    </div></AnimatedDisclosure>
  </article>
}
export function SettingsModal(props: SettingsModalProps) {
  useEffect(() => { void revalidateProviderModels() }, [])
  const [tab, setTab] = useState<'connection' | 'tasks' | 'sharing'>('connection')
  // Close only when the press also started on the overlay: a text selection
  // dragged out of the dialog ends with a click on the overlay otherwise.
  const overlayPressStarted = useRef(false)
  const dialog = useRef<HTMLElement>(null)
  const heightAnimation = useRef<Animation | null>(null)
  const previousHeight = useRef<number | null>(null)
  useEffect(() => {
    // Portaled pickers are outside the layer; every new press resets its guard.
    const resetPress = () => { overlayPressStarted.current = false }
    document.addEventListener('mousedown', resetPress, true)
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const stop = () => { heightAnimation.current?.cancel(); heightAnimation.current = null }
    motion.addEventListener('change', stop)
    return () => { document.removeEventListener('mousedown', resetPress, true); motion.removeEventListener('change', stop); stop() }
  }, [])
  useLayoutEffect(() => {
    const element = dialog.current
    const from = previousHeight.current
    previousHeight.current = null
    heightAnimation.current?.cancel()
    heightAnimation.current = null
    if (!element || from === null || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const to = element.getBoundingClientRect().height
    if (Math.abs(from - to) < 1) return
    const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], motionOptions(element))
    heightAnimation.current = animation
    animation.onfinish = () => { if (heightAnimation.current === animation) heightAnimation.current = null }
  }, [tab])
  function switchTab(next: typeof tab) {
    if (next === tab) return
    previousHeight.current = dialog.current?.getBoundingClientRect().height ?? null
    if (dialog.current) dialog.current.scrollTop = 0
    setTab(next)
  }
  const settings = props.settings
  const providerRows = useAnimatedItems(settings.providers)
  const picker = { providers: settings.providers, recent: settings.recentModels }
  const effort = (task: ReasoningTask) => <ReasoningPicker value={settings.tasks[task].reasoningEffort} label={`${t(task === 'vision' ? 'models-task-vision' : 'models-task-default')} ${t('models-effort')}`} onChange={value => props.onSetReasoningEffort(task, value)} />
  return <div class="modal-layer settings-layer" onMouseDown={event => { overlayPressStarted.current = event.target === event.currentTarget }} onClick={event => {
    const shouldClose = overlayPressStarted.current && event.target === event.currentTarget
    overlayPressStarted.current = false
    if (shouldClose) props.onClose()
  }}>
    <section ref={dialog} class="settings-modal provider-room-settings" role="dialog" aria-modal="true" aria-label={t('settings')}>
      <div class="modal-heading"><h2>{t('settings')}</h2><button type="button" class="icon-button" onClick={props.onClose} aria-label={t('close-settings')}><X size={20} /></button></div>
      <div class="ui-language-row"><span>{t('ob-native-language')}</span><select value={props.nativeLanguage} onChange={event => props.onUpdateNativeLanguage(event.currentTarget.value)}>{languageOptions.map(language => <option value={language}>{languageOptionLabel(language)}</option>)}</select></div>
      <div class="settings-tab-bar" role="tablist"><span class="settings-tab-highlight" aria-hidden="true" style={{ transform: `translateX(${(['connection', 'tasks', 'sharing'] as const).indexOf(tab) * 100}%)` }} />{(['connection', 'tasks', 'sharing'] as const).map(id => <button role="tab" type="button" aria-selected={tab === id} class={tab === id ? 'active' : ''} onClick={() => switchTab(id)}>{t(`settings-tab-${id}`)}</button>)}</div>
      {tab === 'connection' ? <div class="provider-list" role="tabpanel">
        <div class="connections-header"><strong>{t('settings-tab-connection')}</strong><AddConnectionPopup providers={settings.providers} onAddProvider={props.onAddProvider} onUpdateProvider={props.onUpdateProvider} /></div>
        {providerRows.map(({ item: provider, phase }) => <div key={provider.id} class={`settings-motion-item ${phase}`} inert={phase === 'leaving'}><ProviderCard provider={provider} props={props} /></div>)}
        <button type="button" class="link-button" onClick={props.onOpenOnboarding}>{t('ob-reopen')}</button><MistBuildBanner />
      </div> : tab === 'sharing' ? <SharingPanel settings={settings} onSetRoomProvide={props.onSetRoomProvide} onAddProvider={props.onAddProvider} onUpdateProvider={props.onUpdateProvider} /> : <div class="provider-tasks" role="tabpanel">
        <div class="provider-task-row"><span data-tip={t('models-default')}>{t('models-default')}</span><ModelPicker {...picker} name="default-model" label={t('models-default')} value={settings.defaultModel} onChange={props.onSetDefaultModel} /></div>
        <div class="provider-task-row with-effort"><span data-tip={t('models-task-default')}>{t('models-task-default')}</span><ModelPicker {...picker} name="text-model" label={t('models-task-default')} inheritedValue={settings.defaultModel} value={settings.tasks.default.ref} clearLabel={t('models-follow')} onChange={ref => props.onSetTaskRef('default', ref)} />{effort('default')}</div>
        <div class="provider-task-row with-effort"><span data-tip={t('models-task-vision')}>{t('models-task-vision')}</span><ModelPicker {...picker} name="vision-model" label={t('models-task-vision')} inheritedValue={settings.defaultModel} value={settings.tasks.vision.ref} clearLabel={t('models-follow')} onChange={ref => props.onSetTaskRef('vision', ref)} />{effort('vision')}</div>
        <VoiceTaskRows providers={settings.providers} recent={settings.recentModels} defaultProviderId={settings.defaultModel?.providerId} ttsSettings={props.ttsSettings} onUpdateTtsSettings={props.onUpdateTtsSettings} sttSettings={props.sttSettings} onUpdateSttSettings={props.onUpdateSttSettings} onRememberModel={props.onRememberModel} />
      </div>}
    </section>
  </div>
}
