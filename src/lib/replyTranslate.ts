import { extractJsonContent } from './parse'
import { backTranslateText } from './backTranslation'
import { requestChatCompletion } from './llm'
import { nuanceInstructions, nuancePromptPayload } from './nuance'
import type { ProviderSettings, TranslationNuance } from '../types'

export type ReplyTranslateResult = {
  detectedLanguage: string
  translatedReply: string
  // Nuance the reply was translated with; the back-check allows for it.
  nuance?: TranslationNuance
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
  nuance?: TranslationNuance
}): Promise<ReplyTranslateResult> {
  const nuance = nuancePromptPayload(params.nuance)
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content: `You are tc-translate reply mode. The user received partnerMessage from someone and wrote ownReply (in their own language, nativeLanguage, as context) as what they want to say back. Detect the language partnerMessage is written in, then translate ownReply into that language naturally and accurately, preserving intent. Return only JSON of the shape {"detectedLanguage": "...", "translatedReply": "..."}. "detectedLanguage" is the language name in English (e.g. "Japanese", "Spanish").${nuance ? nuanceInstructions : ''}`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          nativeLanguage: params.nativeLanguage,
          partnerMessage: params.partnerMessage,
          ownReply: params.ownReply,
          ...(nuance ? { nuance } : {}),
        }),
      },
    ],
  })

  return parseReplyTranslation(content)
}

export type ReplyBackTranslationResult = {
  backTranslatedText: string
  verdict: string
  issues: string[]
}

function parseReplyBackTranslationReview(content: string, backTranslatedText: string): ReplyBackTranslationResult {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<{
      verdict: unknown
      issues: unknown
    }>
    return {
      backTranslatedText,
      verdict: typeof parsed.verdict === 'string' ? parsed.verdict.trim() : '',
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((issue): issue is string => typeof issue === 'string') : [],
    }
  } catch {
    // Some OpenAI-compatible providers ignore JSON-only instructions.
  }

  return { backTranslatedText, verdict: '', issues: [] }
}

// First back-translate without the original reply, then compare the result.
export async function checkReplyBackTranslation(params: {
  settings: ProviderSettings
  ownReply: string
  translatedReply: string
  nativeLanguage: string
  nuance?: TranslationNuance
}): Promise<ReplyBackTranslationResult> {
  const intendedNuance = nuancePromptPayload(params.nuance)
  const backTranslatedText = await backTranslateText(params.settings, params.translatedReply, params.nativeLanguage)
  const content = await requestChatCompletion({
    settings: params.settings,
    messages: [
      {
        role: 'system',
        content:
          'Compare the independently produced backTranslatedText with ownReply (what the user originally wrote) to identify meaning drift, omissions, additions, and tone/register problems. Return only JSON of the shape {"verdict": "...", "issues": ["..."]}. Write "verdict" and "issues" in nativeLanguage. Keep issues short and concrete. Use an empty issues array when the meaning is preserved. Do not rewrite the back-translation.' +
          (intendedNuance
            ? ' The reply was intentionally adjusted to intendedNuance (relationship register, stance, impression, and/or emotion). Do not report register, politeness, stance, sentence-ending style, emotional coloring, emoji, or kaomoji that match intendedNuance as issues; still report meaning drift.'
            : ''),
      },
      {
        role: 'user',
        content: JSON.stringify({
          nativeLanguage: params.nativeLanguage,
          ownReply: params.ownReply,
          ...(intendedNuance ? { intendedNuance } : {}),
          backTranslatedText,
        }),
      },
    ],
  })

  return parseReplyBackTranslationReview(content, backTranslatedText)
}
