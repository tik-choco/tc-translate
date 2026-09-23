import { fetchModels, MistaiError } from '@tik-choco/mistai'
import { normalizeBaseUrl } from './format'
import { backTranslateTexts, detectBackTranslationLanguage } from './backTranslation'
import { requestChatCompletion } from './llm'
import { requestNetworkOpenAi } from './network'
import { isNetworkProviderBaseUrl } from './networkModels'
import { nuanceInstructions, nuancePromptPayload } from './nuance'
import { parseBackTranslationReview, parsePartialTranslations, parseTranslation } from './parse'
import type {
  BackTranslationCheck,
  ImageInput,
  ProviderSettings,
  TranslationNuance,
  TranslationResult,
  TranslationVariant,
} from '../types'

export async function fetchModelIds(
  connection: Pick<ProviderSettings, 'baseUrl' | 'apiKey'>,
  signal?: AbortSignal,
): Promise<string[]> {
  // fetchModels doesn't take an AbortSignal, so inject it via a custom fetchFn.
  const fetchWithSignal: typeof fetch = (input, init) => fetch(input, { ...init, signal })

  let ids: string[]
  try {
    ids = await fetchModels({ baseUrl: normalizeBaseUrl(connection.baseUrl), apiKey: connection.apiKey }, fetchWithSignal)
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

// Pronunciation fields requested alongside each translation (dropped in fast mode).
const READING_RULE =
  ' Add pronunciation help based on the final output language: for Chinese, include "pinyin" and do not include "reading"; for Japanese, include "reading" in romaji; for English, include "reading" as IPA phonetic transcription; for Korean, include "reading" as revised romanization; for other languages, include "reading" only when a practical pronunciation guide is useful, using a conventional romanization or phonetic notation for that language.'

export async function translateText(params: {
  settings: ProviderSettings
  sourceText: string
  sourceLanguage: string
  targetLanguage: string
  nativeLanguage: string
  tones: string[]
  nuance?: TranslationNuance
  signal?: AbortSignal
  /** Translations decoded so far while the reply streams in (see parsePartialTranslations). */
  onPartial?: (translations: TranslationVariant[]) => void
}): Promise<TranslationResult> {
  const nuance = nuancePromptPayload(params.nuance)
  const mode = params.settings.performanceMode
  // Saver and fast both return just the translations; fast also drops the
  // pronunciation fields to get the result back sooner.
  const notesRule =
    mode !== 'normal'
      ? ' Return "notes" as an empty array.'
      : ' Include 2 to 5 notes when there is something useful to explain.'
  const readingRule = mode === 'fast' ? ' Do not include "reading" or "pinyin".' : READING_RULE
  const content = await requestChatCompletion({
    settings: params.settings,
    signal: params.signal,
    onProgress: params.onPartial
      ? (content) => {
          const partial = parsePartialTranslations(content)
          if (partial.length) params.onPartial?.(partial)
        }
      : undefined,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate, a precise translation engine. Detect the source language automatically. The final translation language must always be targetLanguage. Do not translate into nativeLanguage unless nativeLanguage is also targetLanguage. Return only JSON with "translations" and "notes". Generate only the requested tones. "translations" must be an array of objects with "tone" and "text".' +
          readingRule +
          ' Preserve meaning, names, units, line breaks, and formatting. "notes" must explain the source input text, not the output translation. Write notes in nativeLanguage about the source text nuance, idioms, domain terms, implied context, grammar, and culturally loaded wording. Do not explain your translation choices.' +
          notesRule +
          (nuance
            ? nuanceInstructions
            : ''),
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourceLanguage: params.sourceLanguage,
          targetLanguage: params.targetLanguage,
          nativeLanguage: params.nativeLanguage,
          outputLanguageRule: 'Always translate into targetLanguage.',
          tones: params.tones,
          ...(nuance ? { nuance } : {}),
          text: params.sourceText,
        }),
      },
    ],
  })

  // The prompt rules above are only a request - models sometimes return notes
  // or readings anyway - so enforce the mode's output shape here too.
  const parsed = parseTranslation(content)
  return {
    ...parsed,
    notes: mode === 'normal' ? parsed.notes : [],
    translations:
      mode === 'fast'
        ? parsed.translations.map(({ reading: _reading, pinyin: _pinyin, ...rest }) => rest)
        : parsed.translations,
  }
}

// Stays app-local instead of riding mistai's streamChatCompletion: the
// library's wire ChatMessage.content is string-only, and this request needs
// the OpenAI vision content-part array (text + image_url). Errors are still
// typed MistaiErrors so localizeNetworkError can localize them. Over a direct
// API connection this streams (rather than JSON-wraps) so callers can show
// OCR text as it's read instead of waiting for the whole response; over the
// LLM Network it goes through the single-shot OaiTunnelClient proxy instead
// (no streaming — the whole reply arrives at once via onDelta).
export async function readImageText(params: {
  settings: ProviderSettings
  image: ImageInput
  onDelta?: (delta: string) => void
}): Promise<string> {
  const messages = [
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
  ]

  // 'connection === network' covers an explicit Network toggle; the baseUrl
  // check covers a default preset imported from a network provider's
  // advertised models while connection is still 'api'.
  if (params.settings.connection === 'network' || isNetworkProviderBaseUrl(params.settings.baseUrl)) {
    const response = await requestNetworkOpenAi(params.settings.roomId, {
      path: '/chat/completions',
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({
        // The advertised network name, not a real upstream model id — the
        // provider maps it back to its own upstream model.
        model: params.settings.visionModel.trim() || params.settings.model.trim() || undefined,
        temperature: params.settings.temperature,
        reasoning_effort: params.settings.visionReasoningEffort,
        messages,
      }),
    })

    if (response.status < 200 || response.status >= 300) {
      let errorPayload: { error?: { message?: unknown } } | undefined
      try {
        errorPayload = JSON.parse(response.body) as { error?: { message?: unknown } }
      } catch {
        errorPayload = undefined
      }
      const message =
        typeof errorPayload?.error?.message === 'string'
          ? errorPayload.error.message
          : `Request failed with ${response.status}`
      throw new MistaiError('UPSTREAM_HTTP_ERROR', message, { status: response.status })
    }

    let payload: { choices?: Array<{ message?: { content?: string } }> }
    try {
      payload = JSON.parse(response.body) as { choices?: Array<{ message?: { content?: string } }> }
    } catch {
      throw new MistaiError('UPSTREAM_BAD_RESPONSE', 'The provider returned an empty response.')
    }
    const sourceText = (payload.choices?.[0]?.message?.content ?? '').trim()
    if (!sourceText) {
      throw new Error('No readable text was found in the image.')
    }

    // No streaming over the tunnel: deliver the whole reply as a single delta.
    params.onDelta?.(sourceText)
    return sourceText
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
        reasoning_effort: params.settings.visionReasoningEffort,
        stream: true,
        messages,
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
  nativeLanguage: string
  translations: TranslationVariant[]
  nuance?: TranslationNuance
}): Promise<BackTranslationCheck> {
  const intendedNuance = nuancePromptPayload(params.nuance)
  const sourceLanguage = await detectBackTranslationLanguage(params.settings, params.sourceText)
  const texts = await backTranslateTexts(
    params.settings,
    params.translations.map((translation) => translation.text),
    sourceLanguage,
  )
  const backTranslations = params.translations.map((translation, index) => ({ tone: translation.tone, text: texts[index] }))

  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'Compare each independently produced back-translation with sourceText. Identify meaning drift, omissions, additions, tone/register problems, named-entity errors, number/unit errors, and OCR-sensitive mistakes. Return only JSON with "checks", "summary", and "issues". "checks" must be in the same order as backTranslations and contain objects with "verdict" and "issues". Write all judgments in nativeLanguage. Keep issues short and concrete. Use an empty issues array when the meaning is preserved. Do not rewrite the back-translations.' +
          (intendedNuance
            ? ' The translations were intentionally adjusted to intendedNuance (relationship register, stance, impression, and/or emotion). Do not report register, politeness, stance (such as a request rendered as a command or a humble plea), sentence-ending style, emotional coloring, emoji, or kaomoji that match intendedNuance as issues; still report meaning drift.'
            : ''),
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourceText: params.sourceText,
          nativeLanguage: params.nativeLanguage,
          ...(intendedNuance ? { intendedNuance } : {}),
          backTranslations,
        }),
      },
    ],
  })

  return parseBackTranslationReview(content, backTranslations)
}
