import { exampleSentenceCount } from '../constants'
import { requestChatCompletion } from './llm'
import { parseExampleResult } from './parse'
import type { ExampleResult, ProviderSettings } from '../types'

export async function generateExamples(params: {
  settings: ProviderSettings
  sourceText: string
  nativeLanguage: string
}): Promise<ExampleResult> {
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content: `You are tc-translate example mode, a friendly and precise language tutor. Detect the language of the given word or phrase automatically. Write ${exampleSentenceCount} natural, varied example sentences that use it, from common everyday usage to more nuanced usage. Return only JSON of the shape {"sentences": [{"text": "...", "reading": "...", "translation": "..."}]}. "text" is the example sentence in the original language. "reading" gives its pronunciation (furigana for Japanese kanji, pinyin for Chinese) and should be omitted when the script has no ambiguous reading (e.g. plain English). "translation" is the sentence translated into nativeLanguage.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          nativeLanguage: params.nativeLanguage,
          word: params.sourceText,
        }),
      },
    ],
  })

  return parseExampleResult(content)
}
