import { useCallback, useRef } from 'preact/hooks'
import { initialTranslationTones } from '../constants'
import { isAbortError } from '../lib/abort'
import { checkBackTranslation, translateText } from '../lib/api'
import { createId, writeClipboard } from '../lib/format'
import { detectScript, scriptMatchesLanguage } from '../lib/language'
import { localizeNetworkError } from '../lib/network'
import { mergeNotes, mergeTranslations } from '../lib/parse'
import type {
  BackTranslationCheck,
  ProviderSettings,
  Status,
  TranslationHistoryItem,
  TranslationResult,
  TranslationVariant,
} from '../types'

type UseTranslationActionsParams = {
  settings: ProviderSettings
  sourceText: string
  targetLanguage: string
  nativeLanguage: string
  status: Status
  result: TranslationResult | null
  selectedHistory: TranslationHistoryItem | null
  setSelectedHistory: (item: TranslationHistoryItem | null) => void
  activeHistoryId: string
  setActiveHistoryId: (id: string) => void
  missingToneOptions: string[]
  canTranslate: boolean
  canGenerateTones: boolean
  canCheckBackTranslation: boolean
  backTranslationSourceText: string
  history: TranslationHistoryItem[]
  updateHistory: (history: TranslationHistoryItem[]) => void
  updateHistoryItem: (id: string, result: TranslationResult) => void
  setStatus: (status: Status) => void
  setToneStatus: (status: Status) => void
  setBackTranslationStatus: (status: Status) => void
  setBackTranslation: (value: BackTranslationCheck | null) => void
  setResult: (value: TranslationResult | null) => void
  setError: (value: string) => void
  setCopiedTone: (value: string) => void
}

export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Args) => ref.current(...args), [])
}

export function useTranslationActions(params: UseTranslationActionsParams) {
  const {
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
  } = params

  const translateAbortRef = useRef<AbortController | null>(null)

  async function handleTranslate(): Promise<void> {
    if (!canTranslate || status === 'loading') return

    const controller = new AbortController()
    translateAbortRef.current = controller

    setStatus('loading')
    setToneStatus('idle')
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setError('')
    setCopiedTone('')
    setSelectedHistory(null)

    try {
      const detectedScript = detectScript(sourceText)
      const reversed =
        targetLanguage !== nativeLanguage &&
        scriptMatchesLanguage(detectedScript, targetLanguage) &&
        !scriptMatchesLanguage(detectedScript, nativeLanguage)
      const effectiveTargetLanguage = reversed ? nativeLanguage : targetLanguage
      const translatedResult = await translateText({
        settings,
        sourceText,
        sourceLanguage: 'auto',
        targetLanguage: effectiveTargetLanguage,
        nativeLanguage,
        tones: initialTranslationTones,
        signal: controller.signal,
      })
      const nextResult = {
        ...translatedResult,
        sourceText,
        translatedLanguage: effectiveTargetLanguage,
        reversed,
      }
      const id = createId()
      const historyItem = {
        id,
        createdAt: Date.now(),
        kind: 'translate' as const,
        sourceText,
        targetLanguage: effectiveTargetLanguage,
        translations: nextResult.translations,
        notes: nextResult.notes,
      }
      setResult(nextResult)
      setActiveHistoryId(id)
      updateHistory([historyItem, ...history])
      setStatus('done')
    } catch (translationError) {
      if (isAbortError(translationError)) {
        setStatus('idle')
      } else {
        setError(localizeNetworkError(translationError, 'Translation failed.'))
        setStatus('error')
      }
    } finally {
      if (translateAbortRef.current === controller) translateAbortRef.current = null
    }
  }

  function cancelTranslate(): void {
    translateAbortRef.current?.abort()
  }

  async function handleGenerateTones(): Promise<void> {
    if (!result || !canGenerateTones) return

    const toneSourceText = selectedHistory?.sourceText ?? sourceText
    setToneStatus('loading')
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setError('')

    try {
      const nextToneResult = await translateText({
        settings,
        sourceText: toneSourceText,
        sourceLanguage: 'auto',
        targetLanguage: result.translatedLanguage ?? targetLanguage,
        nativeLanguage,
        tones: missingToneOptions,
      })
      const mergedResult = {
        translations: mergeTranslations(result.translations, nextToneResult.translations),
        notes: mergeNotes(result.notes, nextToneResult.notes),
        sourceText: result.sourceText ?? toneSourceText,
        translatedLanguage: result.translatedLanguage,
        reversed: result.reversed,
      }
      setResult(mergedResult)
      if (selectedHistory) {
        const mergedHistoryItem = {
          ...selectedHistory,
          translations: mergedResult.translations,
          notes: mergedResult.notes,
        }
        setSelectedHistory(mergedHistoryItem)
      }
      updateHistoryItem(activeHistoryId, mergedResult)
      setToneStatus('done')
    } catch (translationError) {
      setError(localizeNetworkError(translationError, 'Tone generation failed.'))
      setToneStatus('error')
    }
  }

  async function handleCheckBackTranslation(): Promise<void> {
    if (!result || !canCheckBackTranslation) return

    setBackTranslationStatus('loading')
    setError('')

    try {
      const nextBackTranslation = await checkBackTranslation({
        settings,
        sourceText: backTranslationSourceText,
        targetLanguage: result.translatedLanguage ?? targetLanguage,
        nativeLanguage,
        translations: result.translations,
      })
      setBackTranslation(nextBackTranslation)
      setBackTranslationStatus('done')
    } catch (checkError) {
      setError(localizeNetworkError(checkError, 'Back-translation check failed.'))
      setBackTranslationStatus('error')
    }
  }

  async function copyTranslation(translation: TranslationVariant): Promise<void> {
    try {
      await writeClipboard(translation.text)
      setCopiedTone(translation.tone)
      window.setTimeout(() => setCopiedTone(''), 1400)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Copy failed.')
    }
  }

  return {
    handleTranslate: useStableCallback(handleTranslate),
    handleGenerateTones: useStableCallback(handleGenerateTones),
    handleCheckBackTranslation: useStableCallback(handleCheckBackTranslation),
    copyTranslation: useStableCallback(copyTranslation),
    cancelTranslate: useStableCallback(cancelTranslate),
  }
}
