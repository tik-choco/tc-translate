import {
  defaultLocalSettings,
  defaultLocalSttSettings,
  defaultLocalTtsSettings,
  defaultNativeLanguage,
  historyStorageKey,
  languageOptions,
  languageSpeechCodes,
  maxHistoryItems,
  modeStorageKey,
  nativeLanguageStorageKey,
  onboardingStorageKey,
  settingsStorageKey,
  sttSettingsStorageKey,
  targetLanguageStorageKey,
  ttsSettingsStorageKey,
} from '../constants'
import type {
  AppMode,
  ExplanationResult,
  ExplanationRubyToken,
  GrammarPoint,
  HistoryKind,
  LocalProviderSettings,
  LocalSttSettings,
  LocalTtsSettings,
  ProofreadCorrection,
  ProofreadResult,
  TranslationHistoryItem,
  TranslationVariant,
  VocabularyEntry,
} from '../types'

// These three keys hold only tc-translate-local settings; baseUrl/apiKey/
// model/temperature now live in the shared `tc-shared-llm-config-v1` key
// (see hooks/useSharedLlmConfig.ts, which runs the one-time migration off of
// these keys' pre-migration shape before anything here is read).

export function loadSettings(): LocalProviderSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(settingsStorageKey) ?? '{}') as Partial<LocalProviderSettings>
    return {
      connection: stored.connection === 'network' ? 'network' : 'api',
      networkProviderEnabled:
        typeof stored.networkProviderEnabled === 'boolean'
          ? stored.networkProviderEnabled
          : defaultLocalSettings.networkProviderEnabled,
      visionPresetId: typeof stored.visionPresetId === 'string' ? stored.visionPresetId : defaultLocalSettings.visionPresetId,
    }
  } catch {
    return defaultLocalSettings
  }
}

export function saveSettings(settings: LocalProviderSettings): void {
  localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
}

export function loadTtsSettings(): LocalTtsSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(ttsSettingsStorageKey) ?? '{}') as Partial<LocalTtsSettings>
    return {
      engine: stored.engine === 'api' ? 'api' : stored.engine === 'network' ? 'network' : 'browser',
    }
  } catch {
    return defaultLocalTtsSettings
  }
}

export function saveTtsSettings(ttsSettings: LocalTtsSettings): void {
  localStorage.setItem(ttsSettingsStorageKey, JSON.stringify(ttsSettings))
}

export function loadSttSettings(): LocalSttSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(sttSettingsStorageKey) ?? '{}') as Partial<LocalSttSettings>
    return {
      engine: stored.engine === 'network' ? 'network' : 'api',
      micDeviceId: typeof stored.micDeviceId === 'string' ? stored.micDeviceId : defaultLocalSttSettings.micDeviceId,
    }
  } catch {
    return defaultLocalSttSettings
  }
}

export function saveSttSettings(sttSettings: LocalSttSettings): void {
  localStorage.setItem(sttSettingsStorageKey, JSON.stringify(sttSettings))
}

export function loadTargetLanguage(): string {
  const stored = localStorage.getItem(targetLanguageStorageKey)
  return stored && languageOptions.includes(stored) ? stored : defaultNativeLanguage
}

export function saveTargetLanguage(language: string): void {
  localStorage.setItem(targetLanguageStorageKey, language)
}

// Primary subtag -> languageOptions entry, derived from languageSpeechCodes
// (each code's primary subtag lowercased). Chinese variants and Filipino are
// special-cased since BCP-47 doesn't map them 1:1 by primary subtag alone.
const primarySubtagToLanguage: Record<string, string> = Object.fromEntries(
  Object.entries(languageSpeechCodes).map(([language, code]) => [code.split('-')[0].toLowerCase(), language]),
)

function detectBrowserNativeLanguage(): string {
  if (typeof navigator === 'undefined' || !navigator.language) return defaultNativeLanguage

  const tag = navigator.language.toLowerCase()
  const primary = tag.split('-')[0]

  if (primary === 'zh') {
    if (tag.includes('tw') || tag.includes('hant') || tag.includes('hk')) return 'Chinese (Traditional)'
    return 'Chinese (Simplified)'
  }

  if (primary === 'fil' || primary === 'tl') return 'Filipino'

  const language = primarySubtagToLanguage[primary]
  return language && languageOptions.includes(language) ? language : defaultNativeLanguage
}

export function loadNativeLanguage(): string {
  const stored = localStorage.getItem(nativeLanguageStorageKey)
  if (stored && languageOptions.includes(stored)) return stored
  return detectBrowserNativeLanguage()
}

export function saveNativeLanguage(language: string): void {
  localStorage.setItem(nativeLanguageStorageKey, language)
}

export function loadMode(): AppMode {
  const stored = localStorage.getItem(modeStorageKey)
  return stored === 'proofread' || stored === 'explain' ? stored : 'translate'
}

export function saveMode(mode: AppMode): void {
  localStorage.setItem(modeStorageKey, mode)
}

export function loadOnboardingSeen(): boolean {
  return localStorage.getItem(onboardingStorageKey) === '1'
}

export function saveOnboardingSeen(): void {
  localStorage.setItem(onboardingStorageKey, '1')
}

function isTranslationVariant(value: unknown): value is TranslationVariant {
  const variant = value as Partial<TranslationVariant>
  return (
    typeof variant?.tone === 'string' &&
    typeof variant?.text === 'string' &&
    (variant.pinyin === undefined || typeof variant.pinyin === 'string') &&
    (variant.reading === undefined || typeof variant.reading === 'string')
  )
}

function isProofreadCorrection(value: unknown): value is ProofreadCorrection {
  const correction = value as Partial<ProofreadCorrection>
  return (
    typeof correction?.before === 'string' &&
    typeof correction?.after === 'string' &&
    typeof correction?.reason === 'string'
  )
}

function isProofreadResult(value: unknown): value is ProofreadResult {
  const result = value as Partial<ProofreadResult>
  return (
    typeof result?.correctedText === 'string' &&
    Array.isArray(result.corrections) &&
    result.corrections.every(isProofreadCorrection) &&
    typeof result.summary === 'string'
  )
}

function isExplanationRubyToken(value: unknown): value is ExplanationRubyToken {
  const token = value as Partial<ExplanationRubyToken>
  return typeof token?.text === 'string' && (token.reading === undefined || typeof token.reading === 'string')
}

function isGrammarPoint(value: unknown): value is GrammarPoint {
  const point = value as Partial<GrammarPoint>
  return (
    typeof point?.pattern === 'string' &&
    typeof point?.explanation === 'string' &&
    (point.example === undefined || typeof point.example === 'string')
  )
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  const entry = value as Partial<VocabularyEntry>
  return (
    typeof entry?.word === 'string' &&
    typeof entry?.meaning === 'string' &&
    (entry.reading === undefined || typeof entry.reading === 'string') &&
    (entry.note === undefined || typeof entry.note === 'string')
  )
}

function isExplanationResult(value: unknown): value is ExplanationResult {
  const result = value as Partial<ExplanationResult>
  return (
    typeof result?.overview === 'string' &&
    Array.isArray(result.rubyTokens) &&
    result.rubyTokens.every(isExplanationRubyToken) &&
    Array.isArray(result.grammarPoints) &&
    result.grammarPoints.every(isGrammarPoint) &&
    Array.isArray(result.vocabulary) &&
    result.vocabulary.every(isVocabularyEntry)
  )
}

export function loadHistory(): TranslationHistoryItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(historyStorageKey) ?? '[]') as unknown
    if (!Array.isArray(stored)) return []

    const items: TranslationHistoryItem[] = []
    for (const raw of stored) {
      const historyItem = raw as Partial<TranslationHistoryItem>
      if (typeof historyItem.id !== 'string' || typeof historyItem.createdAt !== 'number' || typeof historyItem.sourceText !== 'string') continue

      // Legacy items (saved before `kind` existed) and items with an
      // unrecognized `kind` are backfilled as 'translate'.
      const kind: HistoryKind = historyItem.kind === 'proofread' || historyItem.kind === 'explain' ? historyItem.kind : 'translate'
      const notes = Array.isArray(historyItem.notes) ? historyItem.notes : []

      if (kind === 'translate') {
        if (
          typeof historyItem.targetLanguage !== 'string' ||
          !Array.isArray(historyItem.translations) ||
          !historyItem.translations.every(isTranslationVariant)
        ) {
          continue
        }
        items.push({
          id: historyItem.id,
          createdAt: historyItem.createdAt,
          kind: 'translate',
          sourceText: historyItem.sourceText,
          targetLanguage: historyItem.targetLanguage,
          translations: historyItem.translations,
          notes,
        })
      } else if (kind === 'proofread') {
        if (!isProofreadResult(historyItem.proofread)) continue
        items.push({
          id: historyItem.id,
          createdAt: historyItem.createdAt,
          kind: 'proofread',
          sourceText: historyItem.sourceText,
          targetLanguage: '',
          translations: [],
          notes: [],
          proofread: historyItem.proofread,
        })
      } else {
        if (!isExplanationResult(historyItem.explanation)) continue
        items.push({
          id: historyItem.id,
          createdAt: historyItem.createdAt,
          kind: 'explain',
          sourceText: historyItem.sourceText,
          targetLanguage: '',
          translations: [],
          notes: [],
          explanation: historyItem.explanation,
        })
      }
    }

    return items.slice(0, maxHistoryItems)
  } catch {
    return []
  }
}

export function saveHistory(history: TranslationHistoryItem[]): void {
  localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, maxHistoryItems)))
}
