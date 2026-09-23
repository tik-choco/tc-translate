import { useCallback, useRef } from 'preact/hooks'
import { initialTranslationTones } from '../constants'
import { isAbortError } from '../lib/abort'
import { checkBackTranslation, translateText } from '../lib/api'
import { createId, writeClipboard } from '../lib/format'
import { detectScript, scriptMatchesLanguage } from '../lib/language'
import { localizeNetworkError } from '../lib/network'
import { isNuanceActive } from '../lib/nuance'
import type {
  BackTranslationCheck,
  ProviderSettings,
  Status,
  TranslationHistoryItem,
  TranslationNuance,
  TranslationResult,
  TranslationVariant,
} from '../types'

type UseTranslationActionsParams = {
  settings: ProviderSettings
  sourceText: string
  targetLanguage: string
  nativeLanguage: string
  nuance: TranslationNuance
  status: Status
  result: TranslationResult | null
  setSelectedHistory: (item: TranslationHistoryItem | null) => void
  canTranslate: boolean
  canCheckBackTranslation: boolean
  backTranslationSourceText: string
  history: TranslationHistoryItem[]
  updateHistory: (history: TranslationHistoryItem[]) => void
  setStatus: (status: Status) => void
  setBackTranslationStatus: (status: Status) => void
  setBackTranslation: (value: BackTranslationCheck | null) => void
  setResult: (value: TranslationResult | null) => void
  setStreamingTranslations: (value: TranslationVariant[]) => void
  setError: (value: string) => void
  setCopiedTone: (value: string) => void
  autoCopy: boolean
  autoBackCheck: boolean
}

export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: Args) => ref.current(...args), [])
}

export function useTranslationActions(params: UseTranslationActionsParams) {
  const {
    settings,
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
  } = params

  const translateAbortRef = useRef<AbortController | null>(null)
  // Bumped to drop a back-translation check whose result arrives after the
  // input was cleared (or a newer check started).
  const backCheckGenerationRef = useRef(0)

  // `textOverride` lets a caller translate text it just set (e.g. pasted from
  // the clipboard) before the sourceText state update has propagated. The
  // caller is then responsible for the provider-configured check that
  // canTranslate would otherwise cover.
  async function handleTranslate(textOverride?: string): Promise<void> {
    const sourceText = textOverride ?? params.sourceText
    if (status === 'loading') return
    if (textOverride === undefined ? !canTranslate : !sourceText.trim()) return

    const controller = new AbortController()
    translateAbortRef.current = controller

    setStatus('loading')
    setBackTranslation(null)
    setBackTranslationStatus('idle')
    setError('')
    setCopiedTone('')
    setSelectedHistory(null)
    setStreamingTranslations([])

    try {
      const detectedScript = detectScript(sourceText)
      const reversed =
        targetLanguage !== nativeLanguage &&
        scriptMatchesLanguage(detectedScript, targetLanguage) &&
        !scriptMatchesLanguage(detectedScript, nativeLanguage)
      const effectiveTargetLanguage = reversed ? nativeLanguage : targetLanguage
      const activeNuance = isNuanceActive(nuance) ? nuance : undefined
      const translatedResult = await translateText({
        settings,
        sourceText,
        sourceLanguage: 'auto',
        targetLanguage: effectiveTargetLanguage,
        nativeLanguage,
        tones: initialTranslationTones,
        nuance: activeNuance,
        signal: controller.signal,
        onPartial: (partial) => {
          // A cancelled request can still deliver buffered chunks.
          if (!controller.signal.aborted) setStreamingTranslations(partial)
        },
      })
      const nextResult = {
        ...translatedResult,
        sourceText,
        translatedLanguage: effectiveTargetLanguage,
        reversed,
        nuance: activeNuance,
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
        nuance: activeNuance,
      }
      setResult(nextResult)
      updateHistory([historyItem, ...history])
      setStatus('done')
      const first = nextResult.translations[0]
      if (autoCopy && first) void copyTranslation(first, true)
      if (autoBackCheck && nextResult.translations.length) {
        void runBackCheck(sourceText, nextResult.translations, activeNuance)
      }
    } catch (translationError) {
      if (isAbortError(translationError)) {
        setStatus('idle')
      } else {
        setError(localizeNetworkError(translationError, 'Translation failed.'))
        setStatus('error')
      }
    } finally {
      setStreamingTranslations([])
      if (translateAbortRef.current === controller) translateAbortRef.current = null
    }
  }

  function cancelTranslate(): void {
    translateAbortRef.current?.abort()
    backCheckGenerationRef.current += 1
  }

  async function handleCheckBackTranslation(): Promise<void> {
    if (!result || !canCheckBackTranslation) return
    await runBackCheck(backTranslationSourceText, result.translations, result.nuance)
  }

  // Takes its inputs explicitly so the auto check can run on a result that
  // was just produced, before the result state update has propagated.
  async function runBackCheck(
    sourceText: string,
    translations: TranslationVariant[],
    nuance: TranslationNuance | undefined,
  ): Promise<void> {
    const generation = ++backCheckGenerationRef.current
    setBackTranslationStatus('loading')
    setError('')

    try {
      const nextBackTranslation = await checkBackTranslation({
        settings,
        sourceText,
        nativeLanguage,
        translations,
        nuance,
      })
      if (backCheckGenerationRef.current !== generation) return
      setBackTranslation(nextBackTranslation)
      setBackTranslationStatus('done')
    } catch (checkError) {
      if (backCheckGenerationRef.current !== generation) return
      setError(localizeNetworkError(checkError, 'Back-translation check failed.'))
      setBackTranslationStatus('error')
    }
  }

  // `silent` is for the auto copy: a clipboard write outside a user gesture
  // (e.g. the window lost focus while translating) can be refused, and that
  // shouldn't surface as an error the user never asked for.
  async function copyTranslation(translation: TranslationVariant, silent = false): Promise<void> {
    try {
      await writeClipboard(translation.text)
      setCopiedTone(translation.tone)
      window.setTimeout(() => setCopiedTone(''), 1400)
    } catch (copyError) {
      if (silent) return
      setError(copyError instanceof Error ? copyError.message : 'Copy failed.')
    }
  }

  return {
    handleTranslate: useStableCallback(handleTranslate),
    handleCheckBackTranslation: useStableCallback(handleCheckBackTranslation),
    copyTranslation: useStableCallback(copyTranslation),
    cancelTranslate: useStableCallback(cancelTranslate),
  }
}
