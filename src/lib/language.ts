import {
  languageChineseSimplifiedNames,
  languageChineseTraditionalNames,
  languageJapaneseNames,
  languageNativeNames,
  languageSpeechCodes,
  toneChineseSimplifiedNames,
  toneChineseTraditionalNames,
  toneJapaneseNames,
} from '../constants'
import { getUiLanguage } from '../i18n'

/** Canonical language name localized for the active UI language. */
export function languageDisplayName(language: string): string {
  const uiLanguage = getUiLanguage()
  if (uiLanguage === 'ja') return languageJapaneseNames[language] ?? language
  if (uiLanguage === 'zh-CN') return languageChineseSimplifiedNames[language] ?? language
  if (uiLanguage === 'zh-TW') return languageChineseTraditionalNames[language] ?? language
  return language
}

/** Canonical tone name (e.g. "Natural", "Polite") localized for the active UI language. */
export function toneDisplayName(tone: string): string {
  const uiLanguage = getUiLanguage()
  if (uiLanguage === 'ja') return toneJapaneseNames[tone] ?? tone
  if (uiLanguage === 'zh-CN') return toneChineseSimplifiedNames[tone] ?? tone
  if (uiLanguage === 'zh-TW') return toneChineseTraditionalNames[tone] ?? tone
  return tone
}

/** Display name plus the language's own-script name when they differ, e.g. "スペイン語（Español）". */
export function languageOptionLabel(language: string): string {
  const name = languageDisplayName(language)
  const native = languageNativeNames[language]
  return native && native !== name ? `${name}（${native}）` : name
}

export type ScriptGuess =
  | 'japanese'
  | 'korean'
  | 'chinese'
  | 'latin'
  | 'cyrillic'
  | 'arabic'
  | 'hebrew'
  | 'thai'
  | 'devanagari'
  | 'bengali'
  | 'unknown'

const hiraganaKatakana = /[぀-ヿ]/
const hangul = /[가-힯ᄀ-ᇿ]/
const han = /[一-鿿]/
const cyrillic = /[Ѐ-ӿ]/
const arabic = /[؀-ۿ]/
const hebrew = /[֐-׿]/
const thai = /[฀-๿]/
const devanagari = /[ऀ-ॿ]/
const bengali = /[ঀ-৿]/
const latin = /[A-Za-z]/

const languageScripts: Record<string, ScriptGuess> = {
  Japanese: 'japanese',
  Korean: 'korean',
  'Chinese (Simplified)': 'chinese',
  'Chinese (Traditional)': 'chinese',
  English: 'latin',
  Spanish: 'latin',
  French: 'latin',
  German: 'latin',
  Portuguese: 'latin',
  Italian: 'latin',
  Dutch: 'latin',
  Polish: 'latin',
  Swedish: 'latin',
  Turkish: 'latin',
  Indonesian: 'latin',
  Vietnamese: 'latin',
  Filipino: 'latin',
  Malay: 'latin',
  Russian: 'cyrillic',
  Ukrainian: 'cyrillic',
  Arabic: 'arabic',
  Hebrew: 'hebrew',
  Thai: 'thai',
  Hindi: 'devanagari',
  Bengali: 'bengali',
}

const scriptSpeechCodes: Record<ScriptGuess, string | undefined> = {
  japanese: 'ja-JP',
  korean: 'ko-KR',
  chinese: 'zh-CN',
  latin: 'en-US',
  cyrillic: 'ru-RU',
  arabic: 'ar-SA',
  hebrew: 'he-IL',
  thai: 'th-TH',
  devanagari: 'hi-IN',
  bengali: 'bn-BD',
  unknown: undefined,
}

// Lightweight heuristic based on character ranges. Good enough to catch the
// common case of a user pasting text already written in the target language.
export function detectScript(text: string): ScriptGuess {
  const sample = text.trim()
  if (!sample) return 'unknown'
  if (hiraganaKatakana.test(sample)) return 'japanese'
  if (hangul.test(sample)) return 'korean'
  if (han.test(sample)) return 'chinese'
  if (cyrillic.test(sample)) return 'cyrillic'
  if (arabic.test(sample)) return 'arabic'
  if (hebrew.test(sample)) return 'hebrew'
  if (thai.test(sample)) return 'thai'
  if (devanagari.test(sample)) return 'devanagari'
  if (bengali.test(sample)) return 'bengali'
  if (latin.test(sample)) return 'latin'
  return 'unknown'
}

export function scriptMatchesLanguage(script: ScriptGuess, language: string): boolean {
  if (script === 'unknown') return false
  return languageScripts[language] === script
}

export function speechCodeForLanguage(language: string): string | undefined {
  return languageSpeechCodes[language]
}

export function speechCodeForScript(script: ScriptGuess): string | undefined {
  return scriptSpeechCodes[script]
}
