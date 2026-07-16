import { useCallback, useMemo, useRef, useState } from 'preact/hooks'
import { defaultResolvedProvider, maxSimulEntries, maxSimulTargetLanguages, simulContextSize } from '../../constants'
import { normalizeBaseUrl } from '../../lib/format'
import { localizeNetworkError } from '../../lib/network'
import { planTranslationFanOut, translateSegmentForLanguage } from '../../lib/simultaneousTranslate'
import {
  loadSimulTargetLanguages,
  loadSimulTranslateEnabled,
  saveSimulTargetLanguages,
  saveSimulTranslateEnabled,
} from '../../lib/storage'
import type { ProviderSettings } from '../../types'

export type SimulResultStatus = 'pending' | 'done' | 'error' | 'skipped'

export type SimulTranslationResult = {
  language: string
  text: string
  status: SimulResultStatus
  error?: string
}

export type SimulTranslationEntry = {
  id: string
  original: string
  ts: number
  sourceLanguage?: string
  results: SimulTranslationResult[]
}

// Orchestrator (plans the fan-out) -> N parallel workers (one translation
// call per planned target language) for each finalized speech segment from
// the Transcribe tab. See lib/simultaneousTranslate.ts for the two LLM
// calls; this hook owns the per-segment state machine and history/context.
export function useSimultaneousTranslation(settings: ProviderSettings) {
  const [enabled, setEnabledState] = useState<boolean>(loadSimulTranslateEnabled)
  const [targetLanguages, setTargetLanguages] = useState<string[]>(loadSimulTargetLanguages)
  const [entries, setEntries] = useState<SimulTranslationEntry[]>([])

  const contextRef = useRef<string[]>([])
  const idCounterRef = useRef(0)

  const hasProviderConfigured = useMemo(
    () =>
      settings.connection === 'network'
        ? Boolean(settings.roomId.trim())
        : Boolean(settings.model.trim() && normalizeBaseUrl(settings.baseUrl)),
    [settings],
  )

  // Distinct from hasProviderConfigured: that's true even on a fresh install
  // (defaults pre-fill baseUrl/model), so it doesn't tell "never touched
  // Settings" apart from "actually configured". Mirrors useTranslator's
  // providerNeedsSetup so the setup guide shows under the same condition
  // here as in the Translate tab.
  const providerNeedsSetup = useMemo(
    () =>
      settings.connection === 'network'
        ? !settings.roomId.trim()
        : !settings.apiKey.trim() &&
          (!normalizeBaseUrl(settings.baseUrl) || normalizeBaseUrl(settings.baseUrl) === normalizeBaseUrl(defaultResolvedProvider.baseUrl)),
    [settings],
  )

  const canAddLanguage = targetLanguages.length < maxSimulTargetLanguages

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    saveSimulTranslateEnabled(next)
  }, [])

  const addTargetLanguage = useCallback((language: string) => {
    setTargetLanguages((current) => {
      if (current.includes(language) || current.length >= maxSimulTargetLanguages) return current
      const next = [...current, language]
      saveSimulTargetLanguages(next)
      return next
    })
  }, [])

  const removeTargetLanguage = useCallback((language: string) => {
    setTargetLanguages((current) => {
      const next = current.filter((item) => item !== language)
      saveSimulTargetLanguages(next)
      return next
    })
  }, [])

  const reset = useCallback(() => {
    contextRef.current = []
    setEntries([])
  }, [])

  const updateEntry = useCallback((id: string, updater: (entry: SimulTranslationEntry) => SimulTranslationEntry) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? updater(entry) : entry)))
  }, [])

  const submitSegment = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!enabled || !trimmed || targetLanguages.length === 0 || !hasProviderConfigured) return

      const id = `s${++idCounterRef.current}`
      const contextText = contextRef.current.join('\n')
      const candidates = targetLanguages

      setEntries((current) =>
        [
          ...current,
          {
            id,
            original: trimmed,
            ts: Date.now(),
            results: candidates.map((language) => ({ language, text: '', status: 'pending' as const })),
          },
        ].slice(-maxSimulEntries),
      )

      let targets = candidates
      try {
        const plan = await planTranslationFanOut({
          settings,
          text: trimmed,
          candidateLanguages: candidates,
          contextText,
        })
        targets = plan.targets
        updateEntry(id, (entry) => ({
          ...entry,
          sourceLanguage: plan.sourceLanguage || entry.sourceLanguage,
          results: entry.results.map((result) =>
            targets.includes(result.language) ? result : { ...result, status: 'skipped' },
          ),
        }))
      } catch {
        // Planning is best-effort: fall back to translating every candidate.
      }

      await Promise.all(
        targets.map(async (language) => {
          try {
            const translated = await translateSegmentForLanguage({
              settings,
              targetLanguage: language,
              text: trimmed,
              contextText,
            })
            updateEntry(id, (entry) => ({
              ...entry,
              results: entry.results.map((result) =>
                result.language === language ? { language, text: translated, status: 'done' } : result,
              ),
            }))
          } catch (err) {
            updateEntry(id, (entry) => ({
              ...entry,
              results: entry.results.map((result) =>
                result.language === language
                  ? { ...result, status: 'error', error: localizeNetworkError(err, 'Translation failed.') }
                  : result,
              ),
            }))
          }
        }),
      )

      contextRef.current = [...contextRef.current, trimmed].slice(-simulContextSize)
    },
    [enabled, targetLanguages, hasProviderConfigured, settings, updateEntry],
  )

  return {
    enabled,
    setEnabled,
    targetLanguages,
    canAddLanguage,
    addTargetLanguage,
    removeTargetLanguage,
    entries,
    submitSegment,
    reset,
    hasProviderConfigured,
    providerNeedsSetup,
  }
}

export type UseSimultaneousTranslationResult = ReturnType<typeof useSimultaneousTranslation>
