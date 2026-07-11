import { fetchModels, MistaiError } from '@tik-choco/mistai'
import { t } from '../i18n'
import { normalizeBaseUrl } from './format'
import { requestChatCompletion } from './llm'
import { parseBackTranslation, parseTranslation } from './parse'
import type { BackTranslationCheck, ImageInput, ProviderSettings, TranslationResult, TranslationVariant } from '../types'

export async function fetchModelIds(settings: ProviderSettings, signal?: AbortSignal): Promise<string[]> {
  // fetchModels doesn't take an AbortSignal, so inject it via a custom fetchFn.
  const fetchWithSignal: typeof fetch = (input, init) => fetch(input, { ...init, signal })

  let ids: string[]
  try {
    ids = await fetchModels({ baseUrl: normalizeBaseUrl(settings.baseUrl), apiKey: settings.apiKey }, fetchWithSignal)
  } catch (modelError) {
    // fetchModels wraps every fetch failure (aborts included) in a
    // MistaiError; resurface aborts so callers can keep their AbortError check.
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
    // An empty model list was not an error before the migration: callers fall
    // back to the built-in model list on their own.
    if (modelError instanceof MistaiError && modelError.code === 'MODEL_LIST_EMPTY') return []
    throw modelError
  }

  return [...new Set(ids)].sort((left, right) => left.localeCompare(right))
}

export async function translateText(params: {
  settings: ProviderSettings
  sourceText: string
  sourceLanguage: string
  targetLanguage: string
  nativeLanguage: string
  tones: string[]
  signal?: AbortSignal
}): Promise<TranslationResult> {
  const content = await requestChatCompletion({
    settings: params.settings,
    signal: params.signal,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate, a precise translation engine. Detect the source language automatically. The final translation language must always be targetLanguage. Do not translate into nativeLanguage unless nativeLanguage is also targetLanguage. Return only JSON with "translations" and "notes". Generate only the requested tones. "translations" must be an array of objects with "tone" and "text". Add pronunciation help based on the final output language: for Chinese, include "pinyin" and do not include "reading"; for Japanese, include "reading" in romaji; for English, include "reading" as IPA phonetic transcription; for Korean, include "reading" as revised romanization; for other languages, include "reading" only when a practical pronunciation guide is useful, using a conventional romanization or phonetic notation for that language. Preserve meaning, names, units, line breaks, and formatting. "notes" must explain the source input text, not the output translation. Write notes in nativeLanguage about the source text nuance, idioms, domain terms, implied context, grammar, and culturally loaded wording. Do not explain your translation choices. Include 2 to 5 notes when there is something useful to explain.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourceLanguage: params.sourceLanguage,
          targetLanguage: params.targetLanguage,
          nativeLanguage: params.nativeLanguage,
          outputLanguageRule: 'Always translate into targetLanguage.',
          tones: params.tones,
          text: params.sourceText,
        }),
      },
    ],
  })

  return parseTranslation(content)
}

// Stays app-local instead of riding mistai's streamChatCompletion: the
// library's wire ChatMessage.content is string-only, and this request needs
// the OpenAI vision content-part array (text + image_url). Errors are still
// typed MistaiErrors so localizeNetworkError can localize them. Streamed
// (rather than JSON-wrapped) so callers can show OCR text as it's read
// instead of waiting for the whole response.
export async function readImageText(params: {
  settings: ProviderSettings
  image: ImageInput
  onDelta?: (delta: string) => void
}): Promise<string> {
  if (params.settings.connection === 'network') {
    throw new Error(t('network-vision-unsupported'))
  }

  const baseUrl = normalizeBaseUrl(params.settings.baseUrl)
  const model = params.settings.visionModel.trim() || params.settings.model.trim()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (params.settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${params.settings.apiKey}`
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: params.settings.temperature,
        reasoning_effort: 'none',
        stream: true,
        messages: [
          {
            role: 'system',
            content:
              'You are tc-translate OCR. Read all visible text from the image in natural reading order. Reply with only the text you read, preserving useful line breaks. Do not translate, summarize, explain, or correct it. Do not add commentary, headings, or quotation marks around it. If no readable text is present, reply with nothing.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Read the text in this image.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: params.image.dataUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      }),
    })
  } catch (requestError) {
    throw new MistaiError('UPSTREAM_REQUEST_FAILED', `LLM API request failed: ${(requestError as Error).message}`)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined)
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : `Request failed with ${response.status}`
    throw new MistaiError('UPSTREAM_HTTP_ERROR', message, { status: response.status })
  }

  if (!response.body) {
    throw new MistaiError('UPSTREAM_BAD_RESPONSE', 'The provider returned an empty response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue

      let delta = ''
      try {
        const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
        delta = chunk.choices?.[0]?.delta?.content ?? ''
      } catch {
        continue
      }

      if (delta) {
        full += delta
        params.onDelta?.(delta)
      }
    }
  }

  const sourceText = full.trim()
  if (!sourceText) {
    throw new Error('No readable text was found in the image.')
  }

  return sourceText
}

export async function checkBackTranslation(params: {
  settings: ProviderSettings
  sourceText: string
  targetLanguage: string
  nativeLanguage: string
  translations: TranslationVariant[]
}): Promise<BackTranslationCheck> {
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate back-translation checker. Detect the original language from sourceText. For each translated item, translate it back into the original source language, compare the meaning with sourceText, and identify meaning drift, omissions, additions, tone/register problems, named-entity errors, number/unit errors, and OCR-sensitive mistakes. Return only JSON with "checks", "summary", and "issues". "checks" must be an array of objects with "tone", "text", "verdict", and "issues". In each check, "text" is the back-translation in the original source language. Write "verdict", "summary", and "issues" in nativeLanguage. Keep issues short and concrete. Use an empty issues array when the meaning is preserved.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourceText: params.sourceText,
          targetLanguage: params.targetLanguage,
          nativeLanguage: params.nativeLanguage,
          translations: params.translations.map((translation) => ({
            tone: translation.tone,
            text: translation.text,
          })),
        }),
      },
    ],
  })

  return parseBackTranslation(content, params.translations)
}
