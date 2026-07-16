import {
  defaultLocalSettings,
  defaultLocalSttSettings,
  defaultLocalTtsSettings,
  defaultNativeLanguage,
  historyStorageKey,
  languageOptions,
  languageSpeechCodes,
  maxHistoryItems,
  maxSimulTargetLanguages,
  modeStorageKey,
  nativeLanguageStorageKey,
  onboardingStorageKey,
  settingsStorageKey,
  simulTranslateEnabledStorageKey,
  simulTranslateLanguagesStorageKey,
  sttSettingsStorageKey,
  targetLanguageStorageKey,
  ttsSettingsStorageKey,
} from '../constants'
import { storageAddJson, storageGetJson } from './mistStorage'
import type {
  AppMode,
  ExplanationResult,
  ExplanationRubyToken,
  GrammarPoint,
  HistoryItemBody,
  HistoryKind,
  LocalProviderSettings,
  LocalSttSettings,
  LocalTtsSettings,
  PersistedHistoryItem,
  ProofreadCorrection,
  ProofreadResult,
  TranslationHistoryItem,
  TranslationVariant,
  VocabularyEntry,
} from '../types'

// Length cap (in characters) for the inline preview kept in localStorage
// alongside a history item's `bodyCid`. Just enough to show a snippet in the
// history list without re-inflating localStorage with full user content.
const sourcePreviewMaxLength = 200

function buildSourcePreview(sourceText: string): string {
  return sourceText.length > sourcePreviewMaxLength
    ? `${sourceText.slice(0, sourcePreviewMaxLength)}…`
    : sourceText
}

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
      orchestratorPresetId:
        typeof stored.orchestratorPresetId === 'string' ? stored.orchestratorPresetId : defaultLocalSettings.orchestratorPresetId,
      workerPresetId: typeof stored.workerPresetId === 'string' ? stored.workerPresetId : defaultLocalSettings.workerPresetId,
    }
  } catch {
    return defaultLocalSettings
  }
}

export function saveSettings(settings: LocalProviderSettings): void {
  try {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  } catch (err) {
    console.warn('tc-translate: failed to save provider settings', err)
  }
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
  try {
    localStorage.setItem(ttsSettingsStorageKey, JSON.stringify(ttsSettings))
  } catch (err) {
    console.warn('tc-translate: failed to save TTS settings', err)
  }
}

export function loadSttSettings(): LocalSttSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(sttSettingsStorageKey) ?? '{}') as Partial<LocalSttSettings>
    return {
      engine: stored.engine === 'network' ? 'network' : stored.engine === 'browser' ? 'browser' : 'api',
      micDeviceId: typeof stored.micDeviceId === 'string' ? stored.micDeviceId : defaultLocalSttSettings.micDeviceId,
    }
  } catch {
    return defaultLocalSttSettings
  }
}

export function saveSttSettings(sttSettings: LocalSttSettings): void {
  try {
    localStorage.setItem(sttSettingsStorageKey, JSON.stringify(sttSettings))
  } catch (err) {
    console.warn('tc-translate: failed to save STT settings', err)
  }
}

export function loadTargetLanguage(): string {
  const stored = localStorage.getItem(targetLanguageStorageKey)
  return stored && languageOptions.includes(stored) ? stored : defaultNativeLanguage
}

export function saveTargetLanguage(language: string): void {
  try {
    localStorage.setItem(targetLanguageStorageKey, language)
  } catch (err) {
    console.warn('tc-translate: failed to save target language', err)
  }
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
  try {
    localStorage.setItem(nativeLanguageStorageKey, language)
  } catch (err) {
    console.warn('tc-translate: failed to save native language', err)
  }
}

export function loadMode(): AppMode {
  const stored = localStorage.getItem(modeStorageKey)
  return stored === 'proofread' || stored === 'explain' ? stored : 'translate'
}

export function saveMode(mode: AppMode): void {
  try {
    localStorage.setItem(modeStorageKey, mode)
  } catch (err) {
    console.warn('tc-translate: failed to save mode', err)
  }
}

export function loadSimulTranslateEnabled(): boolean {
  return localStorage.getItem(simulTranslateEnabledStorageKey) === '1'
}

export function saveSimulTranslateEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(simulTranslateEnabledStorageKey, enabled ? '1' : '0')
  } catch (err) {
    console.warn('tc-translate: failed to save simultaneous translation toggle', err)
  }
}

export function loadSimulTargetLanguages(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(simulTranslateLanguagesStorageKey) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && languageOptions.includes(item))
      .slice(0, maxSimulTargetLanguages)
  } catch {
    return []
  }
}

export function saveSimulTargetLanguages(targetLanguages: string[]): void {
  try {
    localStorage.setItem(simulTranslateLanguagesStorageKey, JSON.stringify(targetLanguages))
  } catch (err) {
    console.warn('tc-translate: failed to save simultaneous translation languages', err)
  }
}

export function loadOnboardingSeen(): boolean {
  return localStorage.getItem(onboardingStorageKey) === '1'
}

export function saveOnboardingSeen(): void {
  try {
    localStorage.setItem(onboardingStorageKey, '1')
  } catch (err) {
    console.warn('tc-translate: failed to save onboarding-seen flag', err)
  }
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

// Resolves one stored entry's heavy fields: prefer the new `bodyCid` pointer
// (mistlib storage_get), falling back to the pre-migration inline fields
// when there's no `bodyCid` (dual-read). Returns null if neither is usable.
async function resolveHistoryItemBody(historyItem: Partial<PersistedHistoryItem>): Promise<HistoryItemBody | null> {
  if (typeof historyItem.bodyCid === 'string' && historyItem.bodyCid) {
    try {
      const body = await storageGetJson<Partial<HistoryItemBody>>(historyItem.bodyCid)
      if (typeof body.sourceText === 'string') {
        return {
          sourceText: body.sourceText,
          translations: Array.isArray(body.translations) ? body.translations : [],
          proofread: body.proofread,
          explanation: body.explanation,
        }
      }
    } catch (err) {
      console.warn('tc-translate: failed to load history item body', historyItem.id, err)
    }
  }

  if (typeof historyItem.sourceText === 'string') {
    // Legacy shape (pre-migration): fields are inline on the entry itself.
    return {
      sourceText: historyItem.sourceText,
      translations: Array.isArray(historyItem.translations) ? historyItem.translations : [],
      proofread: historyItem.proofread,
      explanation: historyItem.explanation,
    }
  }

  return null
}

async function hydrateHistoryItem(raw: unknown): Promise<TranslationHistoryItem | null> {
  if (raw === null || typeof raw !== 'object') return null
  const historyItem = raw as Partial<PersistedHistoryItem>
  if (typeof historyItem.id !== 'string' || typeof historyItem.createdAt !== 'number') return null

  // Legacy items (saved before `kind` existed) and items with an
  // unrecognized `kind` are backfilled as 'translate'.
  const kind: HistoryKind = historyItem.kind === 'proofread' || historyItem.kind === 'explain' ? historyItem.kind : 'translate'
  const notes = Array.isArray(historyItem.notes) ? historyItem.notes : []

  const body = await resolveHistoryItemBody(historyItem)
  if (!body) return null

  if (kind === 'translate') {
    if (typeof historyItem.targetLanguage !== 'string' || !body.translations.every(isTranslationVariant)) return null
    return {
      id: historyItem.id,
      createdAt: historyItem.createdAt,
      kind: 'translate',
      sourceText: body.sourceText,
      targetLanguage: historyItem.targetLanguage,
      translations: body.translations,
      notes,
    }
  }

  if (kind === 'proofread') {
    if (!isProofreadResult(body.proofread)) return null
    return {
      id: historyItem.id,
      createdAt: historyItem.createdAt,
      kind: 'proofread',
      sourceText: body.sourceText,
      targetLanguage: '',
      translations: [],
      notes: [],
      proofread: body.proofread,
    }
  }

  if (!isExplanationResult(body.explanation)) return null
  return {
    id: historyItem.id,
    createdAt: historyItem.createdAt,
    kind: 'explain',
    sourceText: body.sourceText,
    targetLanguage: '',
    translations: [],
    notes: [],
    explanation: body.explanation,
  }
}

export async function loadHistory(): Promise<TranslationHistoryItem[]> {
  let stored: unknown[] = []
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey) ?? '[]') as unknown
    if (Array.isArray(parsed)) stored = parsed
  } catch {
    return []
  }

  const hydrated = await Promise.all(stored.map(hydrateHistoryItem))
  const items = hydrated.filter((item): item is TranslationHistoryItem => item !== null).slice(0, maxHistoryItems)

  // One-time migration: if any stored entry still has its heavy fields
  // inline (no `bodyCid`), re-save now so it's moved to mistlib storage and
  // localStorage is slimmed down. Best-effort — loadHistory's return value
  // is unaffected either way, and this is a no-op once every entry has a
  // `bodyCid`.
  const needsMigration = stored.some((raw) => {
    if (raw === null || typeof raw !== 'object') return false
    const bodyCid = (raw as Partial<PersistedHistoryItem>).bodyCid
    return typeof bodyCid !== 'string' || !bodyCid
  })
  if (needsMigration && items.length > 0) {
    saveHistory(items).catch((err) => console.warn('tc-translate: history migration save failed', err))
  }

  return items
}

async function toPersistedHistoryItem(item: TranslationHistoryItem): Promise<PersistedHistoryItem> {
  const preview: PersistedHistoryItem = {
    id: item.id,
    createdAt: item.createdAt,
    kind: item.kind,
    targetLanguage: item.targetLanguage,
    notes: item.notes,
    sourcePreview: buildSourcePreview(item.sourceText),
  }

  const body: HistoryItemBody = {
    sourceText: item.sourceText,
    translations: item.translations,
    proofread: item.proofread,
    explanation: item.explanation,
  }

  try {
    preview.bodyCid = await storageAddJson(`${item.id}.tc-translate-history.json`, body)
  } catch (err) {
    // mistlib storage unavailable (e.g. no OPFS in this browser): fall back
    // to the old inline shape rather than losing the item's content.
    console.warn('tc-translate: failed to store history item body, keeping it inline', item.id, err)
    preview.sourceText = body.sourceText
    preview.translations = body.translations
    preview.proofread = body.proofread
    preview.explanation = body.explanation
  }

  return preview
}

// Guards against out-of-order writes when saveHistory is called again (e.g.
// a rapid second edit) before an earlier call's storage_add work finishes:
// only the most recently *started* call is allowed to reach localStorage.
let historySaveSeq = 0

export async function saveHistory(history: TranslationHistoryItem[]): Promise<void> {
  const seq = ++historySaveSeq
  const persisted = await Promise.all(history.slice(0, maxHistoryItems).map(toPersistedHistoryItem))
  if (seq !== historySaveSeq) return

  try {
    localStorage.setItem(historyStorageKey, JSON.stringify(persisted))
  } catch (err) {
    console.warn('tc-translate: failed to save history', err)
  }
}
