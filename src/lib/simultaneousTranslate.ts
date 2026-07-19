import { requestChatCompletion } from './llm'
import { extractJsonContent } from './parse'
import type { ProviderSettings } from '../types'

export type TranslationPlan = {
  sourceLanguage: string
  targets: string[]
}

function parsePlan(content: string, candidateLanguages: string[]): TranslationPlan {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<{ sourceLanguage: unknown; targets: unknown }>
    const targets = Array.isArray(parsed.targets)
      ? parsed.targets.filter((language): language is string => typeof language === 'string' && candidateLanguages.includes(language))
      : []
    return {
      sourceLanguage: typeof parsed.sourceLanguage === 'string' ? parsed.sourceLanguage.trim() : '',
      // An empty/unparsable plan falls back to every candidate rather than
      // silently dropping languages the user asked for.
      targets: targets.length ? targets : candidateLanguages,
    }
  } catch {
    return { sourceLanguage: '', targets: candidateLanguages }
  }
}

// Orchestrator step: decides the source language and which candidate target
// languages are actually worth dispatching to translation workers for this
// segment (skipping ones the segment is already written in). Runs once per
// finalized speech segment, ahead of the parallel worker fan-out below.
export async function planTranslationFanOut(params: {
  settings: ProviderSettings
  text: string
  candidateLanguages: string[]
  contextText: string
  signal?: AbortSignal
}): Promise<TranslationPlan> {
  if (params.candidateLanguages.length <= 1) {
    return { sourceLanguage: '', targets: params.candidateLanguages }
  }

  const content = await requestChatCompletion({
    settings: {
      ...params.settings,
      model: params.settings.orchestratorModel,
      reasoningEffort: params.settings.orchestratorReasoningEffort,
    },
    signal: params.signal,
    messages: [
      {
        role: 'system',
        content:
          'You are the orchestrator for a live simultaneous-translation pipeline. Given one finalized speech segment and a list of candidate target languages, decide the segment\'s source language and which candidates should be dispatched to translation workers this turn. Drop a candidate only when the segment is already written in that language. Return only JSON: {"sourceLanguage": string, "targets": string[]}. "targets" must be a subset of candidateLanguages, in their original order, and must include every candidate that differs from the source language.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          candidateLanguages: params.candidateLanguages,
          context: params.contextText,
          text: params.text,
        }),
      },
    ],
  })

  return parsePlan(content, params.candidateLanguages)
}

// Worker step: translates one finalized segment into one target language.
// The orchestrator dispatches one of these per planned target, run in
// parallel by the caller.
export async function translateSegmentForLanguage(params: {
  settings: ProviderSettings
  targetLanguage: string
  text: string
  contextText: string
  signal?: AbortSignal
}): Promise<string> {
  const content = await requestChatCompletion({
    settings: {
      ...params.settings,
      model: params.settings.workerModel,
      reasoningEffort: params.settings.workerReasoningEffort,
    },
    signal: params.signal,
    messages: [
      {
        role: 'system',
        content:
          'You are a simultaneous-translation worker. Translate the given text into targetLanguage accurately and concisely, using context only as reference for continuity, not as text to translate. Reply with only the translated text - no notes, no quotation marks, no language labels.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          targetLanguage: params.targetLanguage,
          context: params.contextText,
          text: params.text,
        }),
      },
    ],
  })

  return content.trim()
}
