import { requestChatCompletion } from './llm'
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
