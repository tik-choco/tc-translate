import { requestChatCompletion } from './llm'
import { parseExplanation, parseExplanationRuby } from './parse'
import type { ExplanationResult, ExplanationRubyToken, ProviderSettings } from '../types'

export async function explainText(params: {
  settings: ProviderSettings
  sourceText: string
  nativeLanguage: string
}): Promise<ExplanationResult> {
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate explain mode, a friendly and precise language tutor. Detect the language of the text automatically. Explain the grammar and vocabulary of the text so a learner can understand it. Return only JSON with "overview", "grammarPoints", and "vocabulary". "overview" is a short paragraph explaining the overall meaning and structure of the text. "grammarPoints" is an array of objects with "pattern", "explanation", and optional "example"; cover the grammar structures actually used in the text, most important first. "vocabulary" is an array of objects with "word", optional "reading", "meaning", and optional "note"; include the words a learner would look up, where "reading" gives the pronunciation (furigana for Japanese kanji, pinyin for Chinese, phonetic hint otherwise). Write "overview" and every "explanation", "meaning", and "note" in nativeLanguage. Keep "pattern", "word", and "example" in the language of the original text.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          nativeLanguage: params.nativeLanguage,
          text: params.sourceText,
        }),
      },
    ],
  })

  return parseExplanation(content)
}

export async function explainRuby(params: {
  settings: ProviderSettings
  sourceText: string
}): Promise<ExplanationRubyToken[]> {
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate explain mode, a friendly and precise language tutor. Detect the language of the text automatically. Return only JSON of the shape {"ruby": [{"text": "...", "reading": "..."}]}. The "ruby" array tokens must concatenate to the original text exactly, in order. Provide "reading" only for tokens whose pronunciation is not obvious from the script (e.g. kanji, hanzi) — furigana for Japanese kanji, pinyin for Chinese — and omit "reading" for kana, latin letters, punctuation, and spaces.',
      },
      {
        role: 'user',
        content: JSON.stringify({ text: params.sourceText }),
      },
    ],
  })

  return parseExplanationRuby(content)
}
