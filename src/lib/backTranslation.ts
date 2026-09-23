import { requestChatCompletion } from './llm'
import { extractJsonContent } from './parse'
import type { ProviderSettings } from '../types'

// Language detection may read the original. The reverse-translation request
// below receives only the translated text and the language name.
export async function detectBackTranslationLanguage(settings: ProviderSettings, sourceText: string): Promise<string> {
  const language = await requestChatCompletion({
    settings,
    messages: [
      { role: 'system', content: 'Identify the language of the supplied text. Reply with only its language name in English. Distinguish Simplified and Traditional Chinese when possible.' },
      { role: 'user', content: sourceText },
    ],
  })
  const name = language.trim()
  if (!name) throw new Error('Could not detect the source language.')
  return name
}

export async function backTranslateText(settings: ProviderSettings, translatedText: string, language: string): Promise<string> {
  const content = await requestChatCompletion({
    settings,
    messages: [
      { role: 'system', content: 'Translate the supplied text into the specified language. Use only the supplied text as evidence. Preserve its meaning, tone, names, numbers, and line breaks. Reply with only the translation.' },
      { role: 'user', content: JSON.stringify({ language, text: translatedText }) },
    ],
  })
  const text = content.trim()
  if (!text) throw new Error('Back-translation returned no text.')
  return text
}

/**
 * Back-translates several texts into `language`. Normally one request per
 * text, all in parallel (each fully independent); saver mode puts all texts
 * in one request (fewer tokens, but slower), falling back to per-text requests if the batched reply can't be
 * matched up. Either way the original source text is never sent.
 */
export async function backTranslateTexts(settings: ProviderSettings, texts: string[], language: string): Promise<string[]> {
  if (settings.performanceMode === 'saver' && texts.length > 1) {
    try {
      const content = await requestChatCompletion({
        settings,
        messages: [
          {
            role: 'system',
            content:
              'Translate each supplied text into the specified language, independently of the others. Use only the supplied texts as evidence. Preserve meaning, tone, names, numbers, and line breaks. Return only JSON of the shape {"translations": ["..."]} with one entry per input text, in the same order.',
          },
          { role: 'user', content: JSON.stringify({ language, texts }) },
        ],
      })
      const parsed = JSON.parse(extractJsonContent(content)) as { translations?: unknown }
      const translations = Array.isArray(parsed.translations) ? parsed.translations : []
      if (
        translations.length === texts.length &&
        translations.every((text): text is string => typeof text === 'string' && Boolean(text.trim()))
      ) {
        return translations.map((text) => text.trim())
      }
    } catch {
      // Fall through to the per-text requests below.
    }
  }
  return Promise.all(texts.map((text) => backTranslateText(settings, text, language)))
}
