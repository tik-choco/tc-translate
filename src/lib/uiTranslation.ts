import { requestChatCompletion } from './llm'
import type { MessageTable } from '../i18n/types'
import type { ProviderSettings } from '../types'

function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object in response.')
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
}

function placeholderSignature(value: string): string {
  return [...value.matchAll(/\{[A-Za-z0-9]+\}/g)]
    .map((match) => match[0])
    .sort()
    .join(',')
}

/**
 * Translate the app's English UI strings into `language` with the configured
 * LLM. Keys the model drops, leaves empty, or whose `{placeholder}` tokens it
 * mangles fall back to the English source, so a partial answer still yields a
 * usable table.
 */
export async function translateUiMessages(params: {
  settings: ProviderSettings
  language: string
  messages: MessageTable
}): Promise<MessageTable> {
  const { settings, language, messages } = params
  const content = await requestChatCompletion({
    settings,
    messages: [
      {
        role: 'system',
        content:
          `You localize the user interface of a translation app. Translate every value of the JSON object the user sends from English into ${language}. ` +
          'Respond with ONLY a valid JSON object containing exactly the same keys. ' +
          'Keep placeholder tokens such as {count} or {tone} exactly as they are. ' +
          'Leave technical terms like API, Base URL, Room ID, TTS, STT, and product/model names untranslated. ' +
          'Keep translations concise; they are UI labels and short hints.',
      },
      { role: 'user', content: JSON.stringify(messages) },
    ],
  })

  const parsed = extractJsonObject(content)
  const result: MessageTable = {}
  for (const [key, source] of Object.entries(messages)) {
    const translated = parsed[key]
    result[key] =
      typeof translated === 'string' &&
      translated.trim() &&
      placeholderSignature(translated) === placeholderSignature(source)
        ? translated
        : source
  }
  return result
}
