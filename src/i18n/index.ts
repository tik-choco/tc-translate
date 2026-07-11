import { languageSpeechCodes } from '../constants'
import { loadNativeLanguage } from '../lib/storage'
import { appMessages } from './app'
import { featureMessages } from './features'
import { settingsMessages } from './settings'
import { translatorMessages } from './translator'
import type { MessageTable, UiLanguage } from './types'

export type { UiLanguage } from './types'

const tables: Record<UiLanguage, MessageTable> = {
  en: { ...appMessages.en, ...settingsMessages.en, ...translatorMessages.en, ...featureMessages.en },
  ja: { ...appMessages.ja, ...settingsMessages.ja, ...translatorMessages.ja, ...featureMessages.ja },
  'zh-CN': {
    ...appMessages['zh-CN'],
    ...settingsMessages['zh-CN'],
    ...translatorMessages['zh-CN'],
    ...featureMessages['zh-CN'],
  },
  'zh-TW': {
    ...appMessages['zh-TW'],
    ...settingsMessages['zh-TW'],
    ...translatorMessages['zh-TW'],
    ...featureMessages['zh-TW'],
  },
}

// Languages with a hand-written dictionary. Every other language gets an
// LLM-translated overlay generated at runtime and cached in localStorage.
const builtinByLanguage: Record<string, UiLanguage> = {
  Japanese: 'ja',
  English: 'en',
  'Chinese (Simplified)': 'zh-CN',
  'Chinese (Traditional)': 'zh-TW',
}

const uiMessagesCachePrefix = 'tc-translate-ui-messages-v1:'

let currentBuiltin: UiLanguage = 'en'
let currentLanguageName = 'English'
let overlay: MessageTable | null = null

const listeners = new Set<() => void>()

/** Re-render hook for components: fires whenever the active UI messages change. */
export function subscribeUiMessages(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** The active built-in language, or 'en' when the UI language has no built-in dictionary (LLM-translated languages read as 'en' for script/catalog decisions). */
export function getUiLanguage(): UiLanguage {
  return currentBuiltin
}

// Invalidates cached overlays whenever the English source strings change.
function sourceHash(): string {
  const json = JSON.stringify(tables.en)
  let hash = 5381
  for (let i = 0; i < json.length; i += 1) {
    hash = (hash * 33 + json.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function loadCachedOverlay(language: string): MessageTable | null {
  try {
    const raw = localStorage.getItem(uiMessagesCachePrefix + language)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { hash?: unknown }).hash !== sourceHash() ||
      typeof (parsed as { messages?: unknown }).messages !== 'object'
    ) {
      return null
    }
    return (parsed as { messages: MessageTable }).messages
  } catch {
    return null
  }
}

function setDocumentLang(code: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = code
}

export type UiLanguageState = 'ready' | 'needs-translation'

/**
 * Switch the UI language to match the (native) language setting. Returns
 * 'needs-translation' when the language has no built-in dictionary and no
 * valid cached overlay — the caller should then produce one via the LLM and
 * hand it to setUiOverlay. Until then the UI shows English.
 */
export function applyUiLanguageForNative(language: string): UiLanguageState {
  currentLanguageName = language
  const builtin = builtinByLanguage[language]
  if (builtin) {
    currentBuiltin = builtin
    overlay = null
    setDocumentLang(builtin)
    notify()
    return 'ready'
  }
  currentBuiltin = 'en'
  overlay = loadCachedOverlay(language)
  setDocumentLang((languageSpeechCodes[language] ?? 'en').split('-')[0])
  notify()
  return overlay ? 'ready' : 'needs-translation'
}

/** Install (and cache) an LLM-translated message table for a language. */
export function setUiOverlay(language: string, messages: MessageTable): void {
  try {
    localStorage.setItem(uiMessagesCachePrefix + language, JSON.stringify({ hash: sourceHash(), messages }))
  } catch {
    // Caching is best-effort.
  }
  if (language === currentLanguageName) {
    overlay = messages
    notify()
  }
}

/** English source strings handed to the LLM for overlay translation. */
export function getUiSourceMessages(): MessageTable {
  return { ...tables.en }
}

/** Look up a UI message; `{name}` placeholders are filled from params. Unknown keys fall back to English, then to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  let message = overlay?.[key] ?? tables[currentBuiltin][key] ?? tables.en[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      message = message.replace(`{${name}}`, String(value))
    }
  }
  return message
}

if (typeof window !== 'undefined') {
  applyUiLanguageForNative(loadNativeLanguage())
}
