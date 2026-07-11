import { requestChatCompletion } from './llm'
import { parseProofread } from './parse'
import type { ProofreadResult, ProviderSettings } from '../types'

export async function proofreadText(params: {
  settings: ProviderSettings
  sourceText: string
  nativeLanguage: string
}): Promise<ProofreadResult> {
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate proofread mode, a strict but encouraging writing tutor. Detect the language of the text automatically. Correct grammar, spelling, word choice, naturalness, register, punctuation, and formatting problems while preserving meaning and line breaks. Return only JSON with "correctedText", "corrections", and "summary". "correctedText" must be the fully corrected version. "corrections" must be an array of objects with "before", "after", and "reason"; include only concrete fixes. Write every "reason" and "summary" in nativeLanguage. If the text is already natural, return it unchanged with an empty corrections array and a positive summary.',
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

  return parseProofread(content)
}
