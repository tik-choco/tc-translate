import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { defaultResolvedProvider, extraTranslationTones } from '../constants'
import { appendTranscript, createId, normalizeBaseUrl } from '../lib/format'
import { speechCodeForLanguage } from '../lib/language'
import {
  loadMode,
  loadNativeLanguage,
  loadOnboardingSeen,
  loadTargetLanguage,
  saveMode,
  saveNativeLanguage,
  saveOnboardingSeen,
  saveTargetLanguage,
} from '../lib/storage'
import { useExplain } from './useExplain'
import { useHistoryPanel } from './useHistoryPanel'
import { useImageImport } from './useImageImport'
import { useNetworkConsumerConnection } from './useNetworkConsumerConnection'
import { useNetworkConsumerStatusWithTimestamp } from './useNetworkConsumerStatus'
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
  ExplanationResult,
  ExplanationRubyToken,
  ProofreadResult,
  Status,
  TranslationHistoryItem,
  TranslationResult,
} from '../types'

export function useTranslator() {
  const llmConfigState = useSharedLlmConfig()
  const providerSettings = useProviderSettings(llmConfigState)
  const { settings } = providerSettings
  const voiceSettingsHook = useVoiceSettings(llmConfigState)
  const { ttsSettings, sttSettings } = voiceSettingsHook
  const historyPanel = useHistoryPanel()
  const { history, updateHistory, updateHistoryItem, addHistoryItem, patchHistoryItem } = historyPanel
  const networkProvider = useNetworkProvider(settings, ttsSettings, sttSettings, llmConfigState.config)
  useNetworkConsumerConnection(settings)
  const { status: networkConsumerStatus, updatedAt: networkConsumerUpdatedAt } = useNetworkConsumerStatusWithTimestamp()

  const [showSettings, setShowSettings] = useState(false)
  const [showLanguageMenu, setShowLanguageMenu] = useState(false)
  const languageSelectRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sourceText, setSourceText] = useState('')
  const [mode, setMode] = useState<AppMode>(() => loadMode())
  const [targetLanguage, setTargetLanguage] = useState(() => loadTargetLanguage())
  const [nativeLanguage, setNativeLanguage] = useState(() => loadNativeLanguage())
  const [status, setStatus] = useState<Status>('idle')
  const [toneStatus, setToneStatus] = useState<Status>('idle')
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [backTranslation, setBackTranslation] = useState<BackTranslationCheck | null>(null)
  const [backTranslationStatus, setBackTranslationStatus] = useState<Status>('idle')
  const [selectedHistory, setSelectedHistory] = useState<TranslationHistoryItem | null>(null)
  const [activeHistoryId, setActiveHistoryId] = useState('')
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

  const missingToneOptions = useMemo(() => {
    const generated = new Set(result?.translations.map((translation) => translation.tone) ?? [])
    return extraTranslationTones.filter((tone) => !generated.has(tone))
  }, [result])

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

  const canGenerateTones = Boolean(
    result?.translations.length &&
      missingToneOptions.length &&
      (selectedHistory?.sourceText || sourceText.trim()) &&
      hasProviderConfigured &&
      status !== 'loading' &&
      toneStatus !== 'loading',
  )

  const backTranslationSourceText = selectedHistory?.sourceText ?? result?.sourceText ?? sourceText
  const canCheckBackTranslation = Boolean(
    result?.translations.length &&
      backTranslationSourceText.trim() &&
      hasProviderConfigured &&
      status !== 'loading' &&
      toneStatus !== 'loading' &&
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

  function selectMode(nextMode: AppMode): void {
    setMode(nextMode)
    saveMode(nextMode)
    setError('')
    speech.stop()
  }

  function restoreHistoryItem(item: TranslationHistoryItem): void {
    if (item.kind === 'proofread') {
      if (!item.proofread) return
      selectMode('proofread')
      explain.resetExplain()
      setSourceText(item.sourceText)
      proofread.restoreProofread(item.proofread)
      setSelectedHistory(item)
      setActiveHistoryId(item.id)
      setResult(null)
      setBackTranslation(null)
      setBackTranslationStatus('idle')
      setStatus('idle')
      setToneStatus('idle')
      setError('')
      setCopiedTone('')
      return
    }

    if (item.kind === 'explain') {
      if (!item.explanation) return
      selectMode('explain')
      proofread.resetProofread()
      setSourceText(item.sourceText)
      explain.restoreExplain(item.explanation)
      setSelectedHistory(item)
      setActiveHistoryId(item.id)
      setResult(null)
      setBackTranslation(null)
      setBackTranslationStatus('idle')
      setStatus('idle')
      setToneStatus('idle')
      setError('')
      setCopiedTone('')
      return
    }

    selectMode('translate')
    proofread.resetProofread()
    explain.resetExplain()
    updateTargetLanguage(item.targetLanguage)
    setSelectedHistory(item)
    setActiveHistoryId(item.id)
    setResult({
      translations: item.translations,
      notes: item.notes,
      sourceText: item.sourceText,
    })
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setStatus('done')
    setToneStatus('idle')
    setError('')
    setCopiedTone('')
  }

  async function handleImageFile(file: File | null | undefined): Promise<void> {
    if (!file) return

    setSelectedHistory(null)
    setActiveHistoryId('')
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
    setActiveHistoryId('')
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setError('')
    proofread.resetProofread()
    explain.resetExplain()
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

  // First-run onboarding: instead of a separate tour, drop straight into the
  // existing Settings modal so a fresh install is guided to configure an LLM
  // right away, rather than waiting for a translate/proofread attempt to
  // surface the ProviderSetupGuide.
  useEffect(() => {
    if (loadOnboardingSeen()) return
    saveOnboardingSeen()
    if (providerNeedsSetup) setShowSettings(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { handleTranslate, handleGenerateTones, handleCheckBackTranslation, copyTranslation, cancelTranslate } = useTranslationActions({
    settings,
    sourceText,
    targetLanguage,
    nativeLanguage,
    status,
    result,
    selectedHistory,
    setSelectedHistory,
    activeHistoryId,
    setActiveHistoryId,
    missingToneOptions,
    canTranslate,
    canGenerateTones,
    canCheckBackTranslation,
    backTranslationSourceText,
    history,
    updateHistory,
    updateHistoryItem,
    setStatus,
    setToneStatus,
    setBackTranslationStatus,
    setBackTranslation,
    setResult,
    setError,
    setCopiedTone,
  })

  function runTranslate(): void {
    selectMode('translate')
    void handleTranslate()
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

  useEffect(() => {
    if (mode !== 'translate') return
    if (!result?.translations.length) return

    function handleCopyShortcut(event: KeyboardEvent): void {
      if (!event.ctrlKey && !event.metaKey) return
      const index = Number(event.key) - 1
      const translation = result?.translations[index]
      if (!translation) return

      event.preventDefault()
      void copyTranslation(translation)
    }

    window.addEventListener('keydown', handleCopyShortcut)
    return () => window.removeEventListener('keydown', handleCopyShortcut)
  }, [mode, result])

  const stableUpdateTargetLanguage = useStableCallback(updateTargetLanguage)
  const stableRestoreHistoryItem = useStableCallback(restoreHistoryItem)
  const stableHandleImageFile = useStableCallback(handleImageFile)
  const stableDeleteHistoryItem = useStableCallback(historyPanel.deleteHistoryItem)
  const stableClearHistory = useStableCallback(historyPanel.clearHistory)
  const stableSendToLingo = useStableCallback(historyPanel.sendToLingo)
  const stableSpeak = useStableCallback(speech.speak)
  const stableDownloadSpeech = useStableCallback(speech.downloadAudio)
  const stableCopyProofread = useStableCallback(proofread.copyProofread)
  const openSettings = useCallback(() => setShowSettings(true), [])
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
    status,
    toneStatus,
    result,
    backTranslation,
    backTranslationStatus,
    selectedHistory,
    error: mode === 'proofread' ? proofread.proofreadError : mode === 'explain' ? explain.explainError : error,
    copiedTone,
    copiedProofread: proofread.copiedProofread,
    canTranslate,
    canProofread: proofread.canProofread,
    canExplain: explain.canExplain,
    missingToneOptions,
    canGenerateTones,
    canCheckBackTranslation,
    proofreadStatus: proofread.proofreadStatus,
    proofreadResult: proofread.proofreadResult,
    explainStatus: explain.explainStatus,
    explainResult: explain.explainResult,
    explainRubyStatus: explain.explainRubyStatus,
    explainRubyTokens: explain.explainRubyTokens,
    updateTargetLanguage: stableUpdateTargetLanguage,
    updateNativeLanguage,
    restoreHistoryItem: stableRestoreHistoryItem,
    handleImageFile: stableHandleImageFile,
    clearImageInput,
    clearSourceInput,
    runTranslate,
    cancelTranslate,
    runProofread,
    runExplain,
    handleGenerateTones,
    handleCheckBackTranslation,
    copyProofread: stableCopyProofread,
    copyTranslation,
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
  }
}
