import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { defaultResolvedProvider } from '../constants'
import { appendTranscript, createId, normalizeBaseUrl } from '../lib/format'
import { speechCodeForLanguage } from '../lib/language'
import { ensurePreset, ensureProvider } from '../lib/llmConfig'
import { isNetworkProviderBaseUrl } from '../lib/networkModels'
import {
  loadMode,
  loadNativeLanguage,
  loadNuance,
  loadOnboardingSeen,
  loadTargetLanguage,
  loadTranslateAutoBackCheck,
  loadTranslateAutoCopy,
  saveMode,
  saveNativeLanguage,
  saveNuance,
  saveOnboardingSeen,
  saveTargetLanguage,
  saveTranslateAutoBackCheck,
  saveTranslateAutoCopy,
} from '../lib/storage'
import { useExample } from './useExample'
import { useExplain } from './useExplain'
import { useHistoryPanel } from './useHistoryPanel'
import { useImageImport } from './useImageImport'
import { useNetworkConsumerConnection } from './useNetworkConsumerConnection'
import { useNetworkConsumerStatusWithTimestamp } from './useNetworkConsumerStatus'
import { useNetworkModelSync } from './useNetworkModelSync'
import { useNetworkProvider } from './useNetworkProvider'
import { usePdfImport } from './usePdfImport'
import { useProofread } from './useProofread'
import { useProviderSettings } from './useProviderSettings'
import { useSharedLlmConfig } from './useSharedLlmConfig'
import { useSpeech } from './useSpeech'
import { useTranscription } from './useTranscription'
import { useStableCallback, useTranslationActions } from './useTranslationActions'
import { useVoiceSettings } from './useVoiceSettings'
import type {
  AppMode,
  BackTranslationCheck,
  ExampleResult,
  ExplanationResult,
  ExplanationRubyToken,
  ProofreadResult,
  Status,
  TranslationHistoryItem,
  TranslationNuance,
  TranslationVariant,
  TranslationResult,
} from '../types'

export function useTranslator() {
  const llmConfigState = useSharedLlmConfig()
  const providerSettings = useProviderSettings(llmConfigState)
  const { settings } = providerSettings
  const voiceSettingsHook = useVoiceSettings(llmConfigState)
  const { ttsSettings, sttSettings } = voiceSettingsHook
  const historyPanel = useHistoryPanel()
  const { history, updateHistory, addHistoryItem, patchHistoryItem } = historyPanel
  const networkProvider = useNetworkProvider(settings, ttsSettings, sttSettings, llmConfigState.config)
  useNetworkConsumerConnection(settings)
  const { status: networkConsumerStatus, updatedAt: networkConsumerUpdatedAt } = useNetworkConsumerStatusWithTimestamp()
  useNetworkModelSync(settings, networkConsumerStatus, llmConfigState)

  const [showSettings, setShowSettings] = useState(false)
  const [showLanguageMenu, setShowLanguageMenu] = useState(false)
  const languageSelectRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sourceText, setSourceText] = useState('')
  const [mode, setMode] = useState<AppMode>(() => loadMode())
  const [autoCopy, setAutoCopyState] = useState(() => loadTranslateAutoCopy())
  const [autoBackCheck, setAutoBackCheckState] = useState(() => loadTranslateAutoBackCheck())
  const [targetLanguage, setTargetLanguage] = useState(() => loadTargetLanguage())
  const [nativeLanguage, setNativeLanguage] = useState(() => loadNativeLanguage())
  const [nuance, setNuance] = useState<TranslationNuance>(() => loadNuance())
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<TranslationResult | null>(null)
  // Translations decoded so far while a translate request streams in.
  const [streamingTranslations, setStreamingTranslations] = useState<TranslationVariant[]>([])
  const [backTranslation, setBackTranslation] = useState<BackTranslationCheck | null>(null)
  const [backTranslationStatus, setBackTranslationStatus] = useState<Status>('idle')
  const [selectedHistory, setSelectedHistory] = useState<TranslationHistoryItem | null>(null)
  const [error, setError] = useState('')
  const [copiedTone, setCopiedTone] = useState('')

  // Ids of the history items created for the in-flight proofread/explain
  // request, so late-arriving data (explain ruby tokens) can be merged into
  // the right entry instead of clobbering a newer one.
  const proofreadHistoryIdRef = useRef('')
  const explainHistoryRef = useRef<{ id: string; sourceText: string } | null>(null)
  // Ruby tokens usually resolve before the main explain result; when they
  // arrive first (no history item created yet) they're stashed here and
  // merged in once the explain result creates the history item.
  const pendingExplainRubyRef = useRef<{ sourceText: string; tokens: ExplanationRubyToken[] } | null>(null)

  function handleProofreadDone(doneSourceText: string, result: ProofreadResult): void {
    const id = createId()
    proofreadHistoryIdRef.current = id
    addHistoryItem({
      id,
      createdAt: Date.now(),
      kind: 'proofread',
      sourceText: doneSourceText,
      targetLanguage: '',
      translations: [],
      notes: [],
      proofread: result,
    })
  }

  function handleExplainDone(doneSourceText: string, result: ExplanationResult): void {
    const id = createId()
    const pending = pendingExplainRubyRef.current
    const mergedResult =
      pending && pending.sourceText === doneSourceText && pending.tokens.length && !result.rubyTokens.length
        ? { ...result, rubyTokens: pending.tokens }
        : result
    pendingExplainRubyRef.current = null
    explainHistoryRef.current = { id, sourceText: doneSourceText }
    addHistoryItem({
      id,
      createdAt: Date.now(),
      kind: 'explain',
      sourceText: doneSourceText,
      targetLanguage: '',
      translations: [],
      notes: [],
      explanation: mergedResult,
    })
  }

  function handleExplainRubyTokens(doneSourceText: string, tokens: ExplanationRubyToken[]): void {
    const current = explainHistoryRef.current
    if (current && current.sourceText === doneSourceText) {
      patchHistoryItem(current.id, (item) =>
        item.explanation ? { ...item, explanation: { ...item.explanation, rubyTokens: tokens } } : item,
      )
      return
    }
    pendingExplainRubyRef.current = { sourceText: doneSourceText, tokens }
  }

  function handleExampleDone(doneSourceText: string, result: ExampleResult): void {
    addHistoryItem({
      id: createId(),
      createdAt: Date.now(),
      kind: 'example',
      sourceText: doneSourceText,
      targetLanguage: '',
      translations: [],
      notes: [],
      example: result,
    })
  }

  const proofread = useProofread({
    settings,
    sourceText,
    nativeLanguage,
    onDone: handleProofreadDone,
  })

  const explain = useExplain({
    settings,
    sourceText,
    nativeLanguage,
    onDone: handleExplainDone,
    onRubyTokens: handleExplainRubyTokens,
  })

  const example = useExample({
    settings,
    sourceText,
    nativeLanguage,
    onDone: handleExampleDone,
  })

  const speech = useSpeech({ ttsSettings, llmConfig: llmConfigState.config, roomId: settings.roomId })

  function appendSourceText(text: string): void {
    setSourceText((current) => appendTranscript(current, text))
  }

  const transcription = useTranscription({
    sttSettings,
    llmConfig: llmConfigState.config,
    roomId: settings.roomId,
    speechLang: speechCodeForLanguage(nativeLanguage),
    onTranscribed: appendSourceText,
  })

  const pdfImport = usePdfImport({
    settings,
    sourceText,
    setSourceText,
  })

  const imageImport = useImageImport({
    settings,
    sourceText,
    setSourceText,
  })

  const canTranslate = useMemo(
    () =>
      Boolean(
        sourceText.trim() &&
          (settings.connection === 'network' ? settings.roomId.trim() : settings.model.trim() && normalizeBaseUrl(settings.baseUrl)),
      ),
    [settings, sourceText],
  )

  const hasProviderConfigured =
    settings.connection === 'network' ? Boolean(settings.roomId.trim()) : Boolean(settings.model.trim() && normalizeBaseUrl(settings.baseUrl))

  // Distinct from hasProviderConfigured: that only checks the fields are
  // non-empty (and defaults pre-fill baseUrl/model), so it's already true on
  // a fresh install. This instead flags the common "never touched Settings"
  // case - default OpenAI endpoint with no API key entered - so first-time
  // users get a setup guide instead of a silent 401 on their first translate.
  const providerNeedsSetup =
    settings.connection === 'network'
      ? !settings.roomId.trim()
      : !settings.apiKey.trim() &&
        (!normalizeBaseUrl(settings.baseUrl) || normalizeBaseUrl(settings.baseUrl) === normalizeBaseUrl(defaultResolvedProvider.baseUrl))

  const backTranslationSourceText = selectedHistory?.sourceText ?? result?.sourceText ?? sourceText
  const canCheckBackTranslation = Boolean(
    result?.translations.length &&
      backTranslationSourceText.trim() &&
      hasProviderConfigured &&
      status !== 'loading' &&
      backTranslationStatus !== 'loading',
  )

  function updateTargetLanguage(language: string): void {
    setTargetLanguage(language)
    saveTargetLanguage(language)
  }

  function updateNativeLanguage(language: string): void {
    setNativeLanguage(language)
    saveNativeLanguage(language)
  }

  function updateNuance(next: TranslationNuance): void {
    setNuance(next)
    saveNuance(next)
  }

  function selectMode(nextMode: AppMode): void {
    setMode(nextMode)
    saveMode(nextMode)
    setError('')
    speech.stop()
  }

  function restoreHistoryItem(item: TranslationHistoryItem): void {
    // 'reply' items don't fit the Translate tab's single-input mode shape
    // (they need the Reply tab's two-textarea UI) - nothing to restore here.
    if (item.kind === 'reply') return

    if (item.kind === 'proofread') {
      if (!item.proofread) return
      selectMode('proofread')
      explain.resetExplain()
      example.resetExample()
      setSourceText(item.sourceText)
      proofread.restoreProofread(item.proofread)
      setSelectedHistory(item)
      setResult(null)
      setBackTranslation(null)
      setBackTranslationStatus('idle')
      setStatus('idle')
      setError('')
      setCopiedTone('')
      return
    }

    if (item.kind === 'explain') {
      if (!item.explanation) return
      selectMode('explain')
      proofread.resetProofread()
      example.resetExample()
      setSourceText(item.sourceText)
      explain.restoreExplain(item.explanation)
      setSelectedHistory(item)
      setResult(null)
      setBackTranslation(null)
      setBackTranslationStatus('idle')
      setStatus('idle')
      setError('')
      setCopiedTone('')
      return
    }

    if (item.kind === 'example') {
      if (!item.example) return
      selectMode('example')
      proofread.resetProofread()
      explain.resetExplain()
      setSourceText(item.sourceText)
      example.restoreExample(item.example)
      setSelectedHistory(item)
      setResult(null)
      setBackTranslation(null)
      setBackTranslationStatus('idle')
      setStatus('idle')
      setError('')
      setCopiedTone('')
      return
    }

    selectMode('translate')
    proofread.resetProofread()
    explain.resetExplain()
    example.resetExample()
    updateTargetLanguage(item.targetLanguage)
    setSelectedHistory(item)
    setResult({
      translations: item.translations,
      notes: item.notes,
      sourceText: item.sourceText,
      nuance: item.nuance,
    })
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setStatus('done')
    setError('')
    setCopiedTone('')
  }

  async function handleImageFile(file: File | null | undefined): Promise<void> {
    if (!file) return

    setSelectedHistory(null)
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setError('')
    await imageImport.handleImageFile(file)
  }

  function clearImageInput(): void {
    imageImport.clearImageInput()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function clearSourceInput(): void {
    setSourceText('')
    clearImageInput()
    setSelectedHistory(null)
    // Clearing the input clears what was produced from it too; an in-flight
    // translation is cancelled so it can't land after the clear.
    cancelTranslate()
    setResult(null)
    setStreamingTranslations([])
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setError('')
    proofread.resetProofread()
    explain.resetExplain()
    example.resetExample()
  }

  useEffect(() => {
    if (!showSettings && !showLanguageMenu) return

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setShowSettings(false)
      if (event.key === 'Escape') setShowLanguageMenu(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSettings, showLanguageMenu])

  useEffect(() => {
    if (!showLanguageMenu) return

    function handlePointerDown(event: PointerEvent): void {
      if (!languageSelectRef.current?.contains(event.target as Node | null)) {
        setShowLanguageMenu(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showLanguageMenu])

  // First-run onboarding wizard (components/Onboarding.tsx): shown once on a
  // fresh install and re-openable from Settings. Closing it by any path marks
  // it seen.
  const [showOnboarding, setShowOnboarding] = useState(() => !loadOnboardingSeen())

  /**
   * Quick setup from the onboarding wizard: writes one connection into the
   * shared config's default preset (edited in place unless it is a
   * network-imported preset, otherwise a new preset becomes the default) and
   * switches translation to the direct API.
   */
  function applyQuickConnection(input: { baseUrl: string; apiKey: string; model: string }): void {
    const model = input.model.trim()
    llmConfigState.save((config) => {
      const providerId = ensureProvider(config, { baseUrl: input.baseUrl, apiKey: input.apiKey })
      const current = config.presets.find((preset) => preset.id === config.defaultPresetId)
      const currentProvider = config.providers.find((provider) => provider.id === current?.providerId)
      if (current && !(currentProvider && isNetworkProviderBaseUrl(currentProvider.baseUrl))) {
        current.providerId = providerId
        current.model = model
      } else {
        config.defaultPresetId = ensurePreset(config, { providerId, model, label: model })
      }
    })
    if (settings.connection !== 'api') providerSettings.updateSettings({ ...settings, connection: 'api' })
  }

  const { handleTranslate, handleCheckBackTranslation, copyTranslation, cancelTranslate } = useTranslationActions({
    settings,
    sourceText,
    targetLanguage,
    nativeLanguage,
    nuance,
    status,
    result,
    setSelectedHistory,
    canTranslate,
    canCheckBackTranslation,
    backTranslationSourceText,
    history,
    updateHistory,
    setStatus,
    setBackTranslationStatus,
    setBackTranslation,
    setResult,
    setStreamingTranslations,
    setError,
    setCopiedTone,
    autoCopy,
    autoBackCheck,
  })

  function setAutoCopy(value: boolean): void {
    setAutoCopyState(value)
    saveTranslateAutoCopy(value)
  }

  function setAutoBackCheck(value: boolean): void {
    setAutoBackCheckState(value)
    saveTranslateAutoBackCheck(value)
  }

  function runTranslate(): void {
    selectMode('translate')
    void handleTranslate()
  }

  // Always reads the clipboard fresh and replaces sourceText with it, then
  // translates that pasted text - pressing it again after copying a new
  // message overwrites the old one rather than re-translating stale text.
  async function runPasteAndTranslate(): Promise<void> {
    if (status === 'loading' || !hasProviderConfigured) return

    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      // Clipboard read unavailable or denied; nothing to paste.
      return
    }
    if (!text.trim()) return

    setSourceText(text)
    clearImageInput()
    selectMode('translate')
    void handleTranslate(text)
  }

  function runProofread(): void {
    selectMode('proofread')
    proofreadHistoryIdRef.current = ''
    void proofread.handleProofread()
  }

  function runExplain(): void {
    selectMode('explain')
    explainHistoryRef.current = null
    pendingExplainRubyRef.current = null
    void explain.handleExplain()
  }

  function runExample(): void {
    selectMode('example')
    void example.handleExample()
  }

  const stableUpdateTargetLanguage = useStableCallback(updateTargetLanguage)
  const stableUpdateNuance = useStableCallback(updateNuance)
  const stableRestoreHistoryItem = useStableCallback(restoreHistoryItem)
  const stableHandleImageFile = useStableCallback(handleImageFile)
  const stableDeleteHistoryItem = useStableCallback(historyPanel.deleteHistoryItem)
  const stableClearHistory = useStableCallback(historyPanel.clearHistory)
  const stableSendToLingo = useStableCallback(historyPanel.sendToLingo)
  const stableSpeak = useStableCallback(speech.speak)
  const stableDownloadSpeech = useStableCallback(speech.downloadAudio)
  const stableCopyProofread = useStableCallback(proofread.copyProofread)
  const openSettings = useCallback(() => setShowSettings(true), [])
  const openOnboarding = useCallback(() => {
    setShowSettings(false)
    setShowOnboarding(true)
  }, [])
  const closeOnboarding = useCallback(() => {
    saveOnboardingSeen()
    setShowOnboarding(false)
  }, [])
  const closeSettings = useCallback(() => setShowSettings(false), [])
  const refreshModels = useStableCallback(() => void providerSettings.loadModels())

  return {
    ...providerSettings,
    ...voiceSettingsHook,
    ...historyPanel,
    deleteHistoryItem: stableDeleteHistoryItem,
    clearHistory: stableClearHistory,
    sendToLingo: stableSendToLingo,
    llmProviders: llmConfigState.config.providers,
    llmConfig: llmConfigState.config,
    showSettings,
    setShowSettings,
    showLanguageMenu,
    setShowLanguageMenu,
    languageSelectRef,
    inputRef,
    fileInputRef,
    sourceText,
    setSourceText,
    imageInput: imageImport.imageInput,
    isReadingImage: imageImport.isReadingImage,
    imageImportError: imageImport.imageImportError,
    mode,
    targetLanguage,
    nativeLanguage,
    nuance,
    updateNuance: stableUpdateNuance,
    status,
    result,
    streamingTranslations,
    backTranslation,
    backTranslationStatus,
    selectedHistory,
    error:
      mode === 'proofread'
        ? proofread.proofreadError
        : mode === 'explain'
          ? explain.explainError
          : mode === 'example'
            ? example.exampleError
            : error,
    copiedTone,
    copiedProofread: proofread.copiedProofread,
    canTranslate,
    canProofread: proofread.canProofread,
    canExplain: explain.canExplain,
    canExample: example.canExample,
    canCheckBackTranslation,
    proofreadStatus: proofread.proofreadStatus,
    proofreadResult: proofread.proofreadResult,
    explainStatus: explain.explainStatus,
    explainResult: explain.explainResult,
    explainRubyStatus: explain.explainRubyStatus,
    explainRubyTokens: explain.explainRubyTokens,
    exampleStatus: example.exampleStatus,
    exampleResult: example.exampleResult,
    updateTargetLanguage: stableUpdateTargetLanguage,
    updateNativeLanguage,
    restoreHistoryItem: stableRestoreHistoryItem,
    handleImageFile: stableHandleImageFile,
    clearImageInput,
    clearSourceInput,
    runTranslate,
    runPasteAndTranslate,
    canPasteAndTranslate: hasProviderConfigured,
    cancelTranslate,
    runProofread,
    runExplain,
    runExample,
    handleCheckBackTranslation,
    copyProofread: stableCopyProofread,
    copyTranslation,
    autoCopy,
    setAutoCopy: useStableCallback(setAutoCopy),
    autoBackCheck,
    setAutoBackCheck: useStableCallback(setAutoBackCheck),
    speechSupported: speech.supported,
    speakingId: speech.speakingId,
    speechLoadingId: speech.loadingId,
    speechError: speech.speechError,
    speak: stableSpeak,
    stopSpeech: speech.stop,
    speechDownloadSupported: speech.downloadSupported,
    speechDownloadingId: speech.downloadingId,
    downloadSpeech: stableDownloadSpeech,
    openSettings,
    closeSettings,
    refreshModels,
    micSupported: transcription.supported,
    isRecording: transcription.isRecording,
    isTranscribing: transcription.isTranscribing,
    transcriptionError: transcription.transcriptionError,
    liveTranscript: transcription.liveTranscript,
    toggleRecording: transcription.toggleRecording,
    transcribeFile: transcription.transcribeFile,
    isImportingPdf: pdfImport.isImportingPdf,
    pdfImportError: pdfImport.pdfImportError,
    pdfPageProgress: pdfImport.pdfPageProgress,
    importPdfFile: pdfImport.importPdfFile,
    networkProvider,
    networkConsumerStatus,
    networkConsumerUpdatedAt,
    providerNeedsSetup,
    showOnboarding,
    openOnboarding,
    closeOnboarding,
    applyQuickConnection,
  }
}
