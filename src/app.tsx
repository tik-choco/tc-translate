import { BookType, History, Languages, Mic, Moon, Settings, Sun } from 'lucide-preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import '@tik-choco/mistai/ui.css'
import './app.css'
import { HistoryPanel } from './components/HistoryPanel'
import { LanguageSelect } from './components/LanguageSelect'
import { LazyPanel } from './components/LazyPanel'
import { NetworkConsumerIndicator } from './components/NetworkStatusPanel'
import { SettingsModal } from './components/SettingsModal'
import { TabBar, type TabDefinition } from './components/TabBar'
import { TranslatorPanel } from './components/TranslatorPanel'
import { useTheme } from './hooks/useTheme'
import { useTranslator } from './hooks/useTranslator'
import {
  applyUiLanguageForNative,
  getUiSourceMessages,
  setUiOverlay,
  subscribeUiMessages,
  t as msg,
} from './i18n'
import { translateUiMessages } from './lib/uiTranslation'

const loadKanjiPanel = () => import('./features/kanji/KanjiConverterPanel').then((m) => m.KanjiConverterPanel)
const loadTranscribePanel = () => import('./features/transcribe/TranscribePanel').then((m) => m.TranscribePanel)

export function App() {
  const t = useTranslator()
  const { theme, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('translate')
  const [messagesVersion, setMessagesVersion] = useState(0)
  const uiTranslationInFlight = useRef('')
  const transcribePanelProps = useMemo(
    () => ({ onOpenSettings: t.openSettings, settings: t.settings }),
    [t.openSettings, t.settings],
  )

  useEffect(() => subscribeUiMessages(() => setMessagesVersion((version) => version + 1)), [])

  // The UI language follows the native language. Languages without a built-in
  // dictionary get their UI strings translated once by the configured LLM and
  // cached; until that resolves (or if no LLM is reachable) the UI is English.
  useEffect(() => {
    if (applyUiLanguageForNative(t.nativeLanguage) !== 'needs-translation') return
    const language = t.nativeLanguage
    if (uiTranslationInFlight.current === language) return
    uiTranslationInFlight.current = language
    void translateUiMessages({ settings: t.settings, language, messages: getUiSourceMessages() })
      .then((messages) => setUiOverlay(language, messages))
      .catch(() => {
        // No usable LLM or an unparsable answer: the UI stays in English.
      })
      .finally(() => {
        if (uiTranslationInFlight.current === language) uiTranslationInFlight.current = ''
      })
  }, [t.nativeLanguage, t.settings])

  // Tab labels follow the active UI language.
  const tabs: TabDefinition[] = useMemo(
    () => [
      { id: 'translate', label: msg('tab-translate'), icon: Languages },
      { id: 'kanji', label: msg('tab-kanji'), icon: BookType },
      { id: 'transcribe', label: msg('tab-transcribe'), icon: Mic },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messagesVersion],
  )

  return (
    <main class="workspace">
      <header class="topbar">
        <div class="topbar-left">
          <div class="brand" role="img" aria-label="TC Translate">
            <span class="brand-mark" aria-hidden="true">
              <Languages size={20} />
            </span>
          </div>
          <TabBar tabs={tabs} activeId={activeTab} onChange={setActiveTab} />
        </div>

        <div class="topbar-actions">
          {activeTab === 'translate' ? (
            <>
              <LanguageSelect
                containerRef={t.languageSelectRef}
                open={t.showLanguageMenu}
                setOpen={t.setShowLanguageMenu}
                targetLanguage={t.targetLanguage}
                onTargetLanguageChange={t.updateTargetLanguage}
              />
              {t.settings.connection === 'network' ? (
                <NetworkConsumerIndicator status={t.networkConsumerStatus} />
              ) : null}
              <button
                type="button"
                class={`icon-button ${t.showHistory ? 'active' : ''}`}
                onClick={t.toggleHistory}
                title={msg('history')}
                aria-label={msg('history')}
                aria-pressed={t.showHistory}
              >
                <History size={20} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            class="icon-button"
            onClick={toggleTheme}
            title={theme === 'dark' ? msg('theme-light') : msg('theme-dark')}
            aria-label={theme === 'dark' ? msg('theme-light') : msg('theme-dark')}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            type="button"
            class="icon-button"
            onClick={t.openSettings}
            title={msg('settings')}
            aria-label={msg('settings')}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      <div
        id="tab-panel-kanji"
        class={`tab-panel ${activeTab === 'kanji' ? '' : 'tab-hidden'}`}
        role="tabpanel"
        aria-labelledby="tab-kanji"
      >
        <LazyPanel active={activeTab === 'kanji'} load={loadKanjiPanel} />
      </div>
      <div
        id="tab-panel-transcribe"
        class={`tab-panel ${activeTab === 'transcribe' ? '' : 'tab-hidden'}`}
        role="tabpanel"
        aria-labelledby="tab-transcribe"
      >
        <LazyPanel active={activeTab === 'transcribe'} load={loadTranscribePanel} props={transcribePanelProps} />
      </div>

      <section
        id="tab-panel-translate"
        role="tabpanel"
        aria-labelledby="tab-translate"
        class={`translation-shell ${t.showHistory ? '' : 'history-hidden'} ${activeTab === 'translate' ? '' : 'tab-hidden'}`}
      >
        <TranslatorPanel
          inputRef={t.inputRef}
          fileInputRef={t.fileInputRef}
          sourceText={t.sourceText}
          setSourceText={t.setSourceText}
          imageInput={t.imageInput}
          isReadingImage={t.isReadingImage}
          imageImportError={t.imageImportError}
          mode={t.mode}
          onImageFile={t.handleImageFile}
          onClearImage={t.clearImageInput}
          onClearInput={t.clearSourceInput}
          status={t.status}
          canTranslate={t.canTranslate}
          canProofread={t.canProofread}
          canExplain={t.canExplain}
          onTranslate={t.runTranslate}
          onCancelTranslate={t.cancelTranslate}
          onProofread={t.runProofread}
          onExplain={t.runExplain}
          selectedHistory={t.selectedHistory}
          result={t.result}
          proofreadStatus={t.proofreadStatus}
          proofreadResult={t.proofreadResult}
          explainStatus={t.explainStatus}
          explainResult={t.explainResult}
          explainRubyStatus={t.explainRubyStatus}
          explainRubyTokens={t.explainRubyTokens}
          targetLanguage={t.targetLanguage}
          copiedTone={t.copiedTone}
          copiedProofread={t.copiedProofread}
          onCopyTranslation={t.copyTranslation}
          onCopyProofread={t.copyProofread}
          missingToneOptions={t.missingToneOptions}
          toneStatus={t.toneStatus}
          canGenerateTones={t.canGenerateTones}
          onGenerateTones={t.handleGenerateTones}
          backTranslationStatus={t.backTranslationStatus}
          canCheckBackTranslation={t.canCheckBackTranslation}
          onCheckBackTranslation={t.handleCheckBackTranslation}
          backTranslation={t.backTranslation}
          error={t.error}
          nativeLanguage={t.nativeLanguage}
          speechSupported={t.speechSupported}
          speakingId={t.speakingId}
          speechLoadingId={t.speechLoadingId}
          onSpeak={t.speak}
          micSupported={t.micSupported}
          isRecording={t.isRecording}
          isTranscribing={t.isTranscribing}
          transcriptionError={t.transcriptionError}
          liveTranscript={t.liveTranscript}
          onToggleRecording={t.toggleRecording}
          onAudioFile={t.transcribeFile}
          isImportingPdf={t.isImportingPdf}
          pdfImportError={t.pdfImportError}
          pdfPageProgress={t.pdfPageProgress}
          onPdfFile={t.importPdfFile}
          providerNeedsSetup={t.providerNeedsSetup}
          onOpenSettings={t.openSettings}
        />

        <HistoryPanel
          history={t.history}
          onSelect={t.restoreHistoryItem}
          onDelete={t.deleteHistoryItem}
          onClear={t.clearHistory}
        />
      </section>

      {t.showSettings ? (
        <SettingsModal
          nativeLanguage={t.nativeLanguage}
          onUpdateNativeLanguage={t.updateNativeLanguage}
          settings={t.settings}
          onUpdateSettings={t.updateSettings}
          onClose={t.closeSettings}
          selectableModelOptions={t.selectableModelOptions}
          modelStatus={t.modelStatus}
          modelOptions={t.modelOptions}
          modelError={t.modelError}
          onRefreshModels={t.refreshModels}
          onAddProvider={t.addProvider}
          onUpdateProvider={t.updateProvider}
          onRemoveProvider={t.removeProvider}
          onAddPreset={t.addPreset}
          onUpdatePreset={t.updatePreset}
          onRemovePreset={t.removePreset}
          onSetDefaultPresetId={t.setDefaultPresetId}
          onSetVisionPresetId={t.setVisionPresetId}
          onSetOrchestratorPresetId={t.setOrchestratorPresetId}
          onSetWorkerPresetId={t.setWorkerPresetId}
          ttsSettings={t.ttsSettings}
          onUpdateTtsSettings={t.updateTtsSettings}
          sttSettings={t.sttSettings}
          onUpdateSttSettings={t.updateSttSettings}
          llmProviders={t.llmProviders}
          networkConsumerStatus={t.networkConsumerStatus}
          networkConsumerUpdatedAt={t.networkConsumerUpdatedAt}
          networkProviderStatus={t.networkProvider.status}
          networkProviderStatusUpdatedAt={t.networkProvider.statusUpdatedAt}
          networkProviderError={t.networkProvider.errorMessage}
          networkProviderOwnNodeId={t.networkProvider.ownNodeId}
          networkProviderRoomId={t.networkProvider.roomId}
          networkProviderPeers={t.networkProvider.peers}
          networkProviderConsumerCount={t.networkProvider.consumerCount}
          networkProviderLogs={t.networkProvider.logs}
          networkProviderUpstreamConfigured={t.networkProvider.upstreamConfigured}
        />
      ) : null}
    </main>
  )
}
