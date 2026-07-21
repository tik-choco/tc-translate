import { extractJsonContent } from './parse'
import { requestChatCompletion } from './llm'
import type { ProviderSettings } from '../types'

export type ReplyTranslateResult = {
  detectedLanguage: string
  translatedReply: string
}

function parseReplyTranslation(content: string): ReplyTranslateResult {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<{
      detectedLanguage: unknown
      translatedReply: unknown
    }>
    if (typeof parsed.translatedReply === 'string' && parsed.translatedReply.trim()) {
      return {
        detectedLanguage: typeof parsed.detectedLanguage === 'string' ? parsed.detectedLanguage.trim() : '',
        translatedReply: parsed.translatedReply.trim(),
      }
    }
  } catch {
    // Some OpenAI-compatible providers ignore JSON-only instructions.
  }

  return { detectedLanguage: '', translatedReply: content.trim() }
}

// Translates the message the user received (partnerMessage) into their own
// language, so they can understand it before writing a reply. Kept separate
// from translateReply below (different direction, no ownReply involved).
export async function translateIncomingMessage(params: {
  settings: ProviderSettings
  partnerMessage: string
  nativeLanguage: string
}): Promise<string> {
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate reply mode. Detect the language of the given message automatically and translate it into nativeLanguage, naturally and accurately. Reply with only the translated text - no notes, no quotation marks, no language labels.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          nativeLanguage: params.nativeLanguage,
          message: params.partnerMessage,
        }),
      },
    ],
  })

  return content.trim()
}

// Detects the language of the message the user received (partnerMessage),
// then translates the user's own reply (written in their own language) into
// that detected language - a single round-trip so the detection and
// translation stay consistent with each other.
export async function translateReply(params: {
  settings: ProviderSettings
  partnerMessage: string
  ownReply: string
  nativeLanguage: string
}): Promise<ReplyTranslateResult> {
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'You are tc-translate reply mode. The user received partnerMessage from someone and wrote ownReply (in their own language, nativeLanguage, as context) as what they want to say back. Detect the language partnerMessage is written in, then translate ownReply into that language naturally and accurately, preserving tone and intent. Return only JSON of the shape {"detectedLanguage": "...", "translatedReply": "..."}. "detectedLanguage" is the language name in English (e.g. "Japanese", "Spanish").',
      },
      {
        role: 'user',
        content: JSON.stringify({
          nativeLanguage: params.nativeLanguage,
          partnerMessage: params.partnerMessage,
          ownReply: params.ownReply,
        }),
      },
    ],
  })

  return parseReplyTranslation(content)
}
