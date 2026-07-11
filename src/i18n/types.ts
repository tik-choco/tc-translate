export type UiLanguage = 'en' | 'ja' | 'zh-CN' | 'zh-TW'

export type MessageTable = Record<string, string>

/** One area's messages: same keys in every language, en is the fallback. */
export type MessageBundle = { en: MessageTable; ja: MessageTable; 'zh-CN': MessageTable; 'zh-TW': MessageTable }
