import type {
  LegacyProviderSettings,
  LegacySttSettings,
  LegacyTtsSettings,
  LocalProviderSettings,
  LocalSttSettings,
  LocalTtsSettings,
} from './types'

export const settingsStorageKey = 'tc-translate-provider-settings-v1'
// Legacy combined TTS/STT settings key, read only for one-time migration.
export const voiceSettingsStorageKey = 'tc-translate-voice-settings-v1'
export const ttsSettingsStorageKey = 'tc-translate-tts-settings-v1'
export const sttSettingsStorageKey = 'tc-translate-stt-settings-v1'
export const historyStorageKey = 'tc-translate-history-v1'
export const targetLanguageStorageKey = 'tc-translate-target-language-v1'
export const nativeLanguageStorageKey = 'tc-translate-native-language-v1'
export const modeStorageKey = 'tc-translate-mode-v1'
export const onboardingStorageKey = 'tc-translate-onboarding-seen-v1'
export const defaultNativeLanguage = 'Japanese'
export const maxHistoryItems = 20
// Safety cap so a forgotten recording can't run (and accumulate audio) forever.
export const maxRecordingDurationMs = 30 * 60 * 1000

// New app-local defaults (post shared-llm-config migration / fresh installs).
export const defaultLocalSettings: LocalProviderSettings = {
  connection: 'api',
  networkProviderEnabled: false,
  visionPresetId: '',
}

export const defaultLocalTtsSettings: LocalTtsSettings = {
  engine: 'browser',
}

export const defaultLocalSttSettings: LocalSttSettings = {
  engine: 'api',
  micDeviceId: '',
}

// Fallback connection info used when the shared llm config has no default
// preset yet (fresh install, or migration skipped seeding from pristine
// legacy defaults). Mirrors the pre-migration defaults so first-run UX
// (baseUrl pre-filled, providerNeedsSetup gating) is unchanged.
export const defaultResolvedProvider = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  visionModel: 'gpt-4o-mini',
  temperature: 0.2,
}

// Pre-migration defaults, used only to fill Partial<Legacy*Settings> read
// from old localStorage during the one-time migration to the shared llm
// config (see lib/migrateLlmConfig.ts).
export const legacyDefaultSettings: LegacyProviderSettings = {
  baseUrl: defaultResolvedProvider.baseUrl,
  apiKey: defaultResolvedProvider.apiKey,
  model: defaultResolvedProvider.model,
  visionModel: defaultResolvedProvider.visionModel,
  temperature: defaultResolvedProvider.temperature,
  connection: 'api',
  roomId: '',
  networkProviderEnabled: false,
}

export const legacyDefaultTtsSettings: LegacyTtsSettings = {
  baseUrl: '',
  apiKey: '',
  model: 'tts-1',
  voice: 'alloy',
  engine: 'browser',
}

export const legacyDefaultSttSettings: LegacySttSettings = {
  baseUrl: '',
  apiKey: '',
  model: 'whisper-1',
  engine: 'api',
  micDeviceId: '',
}

export const languageOptions = [
  'Japanese',
  'English',
  'Korean',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
  'Russian',
  'Arabic',
  'Hindi',
  'Indonesian',
  'Vietnamese',
  'Thai',
  'Turkish',
  'Dutch',
  'Polish',
  'Ukrainian',
  'Swedish',
  'Filipino',
  'Malay',
  'Bengali',
  'Hebrew',
]

// Each language's name in its own script, shown alongside the display name so
// users can spot their language in the picker (and search by it).
export const languageNativeNames: Record<string, string> = {
  Japanese: '日本語',
  English: 'English',
  Korean: '한국어',
  'Chinese (Simplified)': '简体中文',
  'Chinese (Traditional)': '繁體中文',
  Spanish: 'Español',
  French: 'Français',
  German: 'Deutsch',
  Portuguese: 'Português',
  Italian: 'Italiano',
  Russian: 'Русский',
  Arabic: 'العربية',
  Hindi: 'हिन्दी',
  Indonesian: 'Bahasa Indonesia',
  Vietnamese: 'Tiếng Việt',
  Thai: 'ไทย',
  Turkish: 'Türkçe',
  Dutch: 'Nederlands',
  Polish: 'Polski',
  Ukrainian: 'Українська',
  Swedish: 'Svenska',
  Filipino: 'Filipino',
  Malay: 'Bahasa Melayu',
  Bengali: 'বাংলা',
  Hebrew: 'עברית',
}

// Japanese display names, used when the UI language is ja (also searchable).
export const languageJapaneseNames: Record<string, string> = {
  Japanese: '日本語',
  English: '英語',
  Korean: '韓国語',
  'Chinese (Simplified)': '中国語（簡体）',
  'Chinese (Traditional)': '中国語（繁体）',
  Spanish: 'スペイン語',
  French: 'フランス語',
  German: 'ドイツ語',
  Portuguese: 'ポルトガル語',
  Italian: 'イタリア語',
  Russian: 'ロシア語',
  Arabic: 'アラビア語',
  Hindi: 'ヒンディー語',
  Indonesian: 'インドネシア語',
  Vietnamese: 'ベトナム語',
  Thai: 'タイ語',
  Turkish: 'トルコ語',
  Dutch: 'オランダ語',
  Polish: 'ポーランド語',
  Ukrainian: 'ウクライナ語',
  Swedish: 'スウェーデン語',
  Filipino: 'フィリピン語',
  Malay: 'マレー語',
  Bengali: 'ベンガル語',
  Hebrew: 'ヘブライ語',
}

// Simplified Chinese display names, used when the UI language is zh-CN (also searchable).
export const languageChineseSimplifiedNames: Record<string, string> = {
  Japanese: '日语',
  English: '英语',
  Korean: '韩语',
  'Chinese (Simplified)': '简体中文',
  'Chinese (Traditional)': '繁体中文',
  Spanish: '西班牙语',
  French: '法语',
  German: '德语',
  Portuguese: '葡萄牙语',
  Italian: '意大利语',
  Russian: '俄语',
  Arabic: '阿拉伯语',
  Hindi: '印地语',
  Indonesian: '印度尼西亚语',
  Vietnamese: '越南语',
  Thai: '泰语',
  Turkish: '土耳其语',
  Dutch: '荷兰语',
  Polish: '波兰语',
  Ukrainian: '乌克兰语',
  Swedish: '瑞典语',
  Filipino: '菲律宾语',
  Malay: '马来语',
  Bengali: '孟加拉语',
  Hebrew: '希伯来语',
}

// Traditional Chinese display names, used when the UI language is zh-TW (also searchable).
export const languageChineseTraditionalNames: Record<string, string> = {
  Japanese: '日語',
  English: '英語',
  Korean: '韓語',
  'Chinese (Simplified)': '簡體中文',
  'Chinese (Traditional)': '繁體中文',
  Spanish: '西班牙語',
  French: '法語',
  German: '德語',
  Portuguese: '葡萄牙語',
  Italian: '義大利語',
  Russian: '俄語',
  Arabic: '阿拉伯語',
  Hindi: '印地語',
  Indonesian: '印尼語',
  Vietnamese: '越南語',
  Thai: '泰語',
  Turkish: '土耳其語',
  Dutch: '荷蘭語',
  Polish: '波蘭語',
  Ukrainian: '烏克蘭語',
  Swedish: '瑞典語',
  Filipino: '菲律賓語',
  Malay: '馬來語',
  Bengali: '孟加拉語',
  Hebrew: '希伯來語',
}

export const initialTranslationTones = ['Natural']
export const extraTranslationTones = ['Polite', 'Casual', 'Business', 'Literal']

// Japanese display names for tones, used when the UI language is ja.
export const toneJapaneseNames: Record<string, string> = {
  Natural: '自然',
  Polite: '丁寧',
  Casual: 'カジュアル',
  Business: 'ビジネス',
  Literal: '直訳',
}

// Simplified Chinese display names for tones, used when the UI language is zh-CN.
export const toneChineseSimplifiedNames: Record<string, string> = {
  Natural: '自然',
  Polite: '礼貌',
  Casual: '随意',
  Business: '商务',
  Literal: '直译',
}

// Traditional Chinese display names for tones, used when the UI language is zh-TW.
export const toneChineseTraditionalNames: Record<string, string> = {
  Natural: '自然',
  Polite: '禮貌',
  Casual: '隨性',
  Business: '商務',
  Literal: '直譯',
}

export const languageSpeechCodes: Record<string, string> = {
  Japanese: 'ja-JP',
  English: 'en-US',
  Korean: 'ko-KR',
  'Chinese (Simplified)': 'zh-CN',
  'Chinese (Traditional)': 'zh-TW',
  Spanish: 'es-ES',
  French: 'fr-FR',
  German: 'de-DE',
  Portuguese: 'pt-BR',
  Italian: 'it-IT',
  Russian: 'ru-RU',
  Arabic: 'ar-SA',
  Hindi: 'hi-IN',
  Indonesian: 'id-ID',
  Vietnamese: 'vi-VN',
  Thai: 'th-TH',
  Turkish: 'tr-TR',
  Dutch: 'nl-NL',
  Polish: 'pl-PL',
  Ukrainian: 'uk-UA',
  Swedish: 'sv-SE',
  Filipino: 'fil-PH',
  Malay: 'ms-MY',
  Bengali: 'bn-BD',
  Hebrew: 'he-IL',
}

export const fallbackModelOptions = [
  'gpt-4o-mini',
  'gpt-4o',
  'llama3.2',
  'llama3.1',
  'qwen2.5',
  'qwen3',
  'mistral',
  'gemma3',
  'deepseek-r1',
]
