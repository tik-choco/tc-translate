import { initialTranslationTones } from '../constants'
import type {
  BackTranslationCheck,
  BackTranslationItem,
  ExampleResult,
  ExampleSentence,
  ExplanationResult,
  ExplanationRubyToken,
  GrammarPoint,
  ProofreadCorrection,
  ProofreadResult,
  TranslationResult,
  TranslationVariant,
  VocabularyEntry,
} from '../types'

export function extractJsonContent(content: string): string {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1]) return fenced[1].trim()

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return trimmed
}

const jsonEscapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' }

// Decodes a JSON string body starting at `start` (just past the opening
// quote) up to its closing quote, or to the end of an unfinished stream. An
// escape cut off mid-way is dropped rather than shown half-decoded.
function readPartialJsonString(content: string, start: number): string {
  let out = ''
  for (let index = start; index < content.length; index += 1) {
    const char = content[index]
    if (char === '"') break
    if (char !== '\\') {
      out += char
      continue
    }
    const next = content[index + 1]
    if (next === undefined) break
    if (next === 'u') {
      const hex = content.slice(index + 2, index + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break
      out += String.fromCharCode(Number.parseInt(hex, 16))
      index += 5
    } else {
      out += jsonEscapes[next] ?? next
      index += 1
    }
  }
  return out
}

/**
 * Best-effort translations from a still-streaming translation reply, for live
 * display: each `"text"` value read so far (possibly cut off mid-string),
 * paired with the `"tone"` before it. The final reply is still parsed with
 * parseTranslation; this never throws and returns [] until a text starts.
 */
export function parsePartialTranslations(content: string): TranslationVariant[] {
  const translations: TranslationVariant[] = []
  const textKey = /"text"\s*:\s*"/g
  let match: RegExpExecArray | null
  while ((match = textKey.exec(content))) {
    const before = content.slice(0, match.index)
    const tones = [...before.matchAll(/"tone"\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
    const tone = tones.length ? readPartialJsonString(tones[tones.length - 1][1] + '"', 0) : initialTranslationTones[0]
    const text = readPartialJsonString(content, match.index + match[0].length)
    if (text) translations.push({ tone, text })
  }
  return translations
}

export function parseNotes(notes: unknown): string[] {
  if (Array.isArray(notes)) return notes.filter((note): note is string => typeof note === 'string')
  if (typeof notes === 'string' && notes.trim()) return [notes.trim()]
  return []
}

export function parseSourceText(parsed: unknown): string | undefined {
  const maybe = parsed as Partial<{
    sourceText: unknown
    detectedText: unknown
    ocrText: unknown
    recognizedText: unknown
    text: unknown
  }>
  const sourceText = [maybe.sourceText, maybe.ocrText, maybe.detectedText, maybe.recognizedText, maybe.text].find(
    (item): item is string => typeof item === 'string' && Boolean(item.trim()),
  )
  return sourceText?.trim()
}

export function parseBackTranslationReview(
  content: string,
  backTranslations: Pick<BackTranslationItem, 'tone' | 'text'>[],
): BackTranslationCheck {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<{
      checks: unknown
      summary: unknown
      issues: unknown
    }>
    const rawChecks = Array.isArray(parsed.checks) ? parsed.checks : []
    const checks = backTranslations.map((backTranslation, index): BackTranslationItem => {
      const maybe = rawChecks[index] as Partial<{ verdict: unknown; issues: unknown }> | undefined
      return {
        ...backTranslation,
        verdict: typeof maybe?.verdict === 'string' ? maybe.verdict.trim() : '',
        issues: parseNotes(maybe?.issues),
      }
    })

    return {
      checks,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      issues: parseNotes(parsed.issues),
    }
  } catch {
    return {
      checks: backTranslations.map((backTranslation) => ({ ...backTranslation, verdict: '', issues: [] })),
      summary: content.trim(),
      issues: [],
    }
  }
}

export function parseProofread(content: string): ProofreadResult {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<{
      correctedText: unknown
      corrected: unknown
      text: unknown
      corrections: unknown
      summary: unknown
    }>
    const correctedText = [parsed.correctedText, parsed.corrected, parsed.text].find(
      (value): value is string => typeof value === 'string',
    )
    const corrections = Array.isArray(parsed.corrections)
      ? parsed.corrections
          .map((item) => {
            const correction = item as Partial<ProofreadCorrection>
            if (
              typeof correction.before !== 'string' ||
              typeof correction.after !== 'string' ||
              typeof correction.reason !== 'string'
            ) {
              return null
            }
            return {
              before: correction.before,
              after: correction.after,
              reason: correction.reason,
            }
          })
          .filter((item): item is ProofreadCorrection => item !== null)
      : []

    if (typeof correctedText === 'string') {
      return {
        correctedText,
        corrections,
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      }
    }
  } catch {
    // Some OpenAI-compatible providers ignore JSON-only instructions.
  }

  return {
    correctedText: content.trim(),
    corrections: [],
    summary: '',
  }
}

export function parseRubyTokens(raw: unknown): ExplanationRubyToken[] {
  const rawRuby = Array.isArray(raw) ? raw : []
  return rawRuby
    .map((item) => {
      const token = item as Partial<ExplanationRubyToken>
      if (typeof token.text !== 'string' || !token.text) return null
      return {
        text: token.text,
        ...(typeof token.reading === 'string' && token.reading.trim() ? { reading: token.reading.trim() } : {}),
      }
    })
    .filter((item): item is ExplanationRubyToken => item !== null)
}

export function parseExplanationRuby(content: string): ExplanationRubyToken[] {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as unknown
    if (Array.isArray(parsed)) return parseRubyTokens(parsed)

    const maybe = parsed as Partial<{ ruby: unknown; rubyTokens: unknown }>
    const rawRuby = Array.isArray(maybe.ruby) ? maybe.ruby : Array.isArray(maybe.rubyTokens) ? maybe.rubyTokens : []
    return parseRubyTokens(rawRuby)
  } catch {
    return []
  }
}

export function parseExplanation(content: string): ExplanationResult {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<{
      overview: unknown
      summary: unknown
      explanation: unknown
      ruby: unknown
      rubyTokens: unknown
      grammarPoints: unknown
      grammar: unknown
      vocabulary: unknown
      words: unknown
    }>

    const overview = [parsed.overview, parsed.summary, parsed.explanation].find(
      (value): value is string => typeof value === 'string',
    )

    const rawRuby = Array.isArray(parsed.ruby) ? parsed.ruby : Array.isArray(parsed.rubyTokens) ? parsed.rubyTokens : []
    const rubyTokens = parseRubyTokens(rawRuby)

    const rawGrammar = Array.isArray(parsed.grammarPoints)
      ? parsed.grammarPoints
      : Array.isArray(parsed.grammar)
        ? parsed.grammar
        : []
    const grammarPoints = rawGrammar
      .map((item) => {
        const point = item as Partial<GrammarPoint>
        if (typeof point.pattern !== 'string' || typeof point.explanation !== 'string') return null
        return {
          pattern: point.pattern,
          explanation: point.explanation,
          ...(typeof point.example === 'string' && point.example.trim() ? { example: point.example.trim() } : {}),
        }
      })
      .filter((item): item is GrammarPoint => item !== null)

    const rawVocabulary = Array.isArray(parsed.vocabulary)
      ? parsed.vocabulary
      : Array.isArray(parsed.words)
        ? parsed.words
        : []
    const vocabulary = rawVocabulary
      .map((item) => {
        const entry = item as Partial<VocabularyEntry>
        if (typeof entry.word !== 'string' || typeof entry.meaning !== 'string') return null
        return {
          word: entry.word,
          meaning: entry.meaning,
          ...(typeof entry.reading === 'string' && entry.reading.trim() ? { reading: entry.reading.trim() } : {}),
          ...(typeof entry.note === 'string' && entry.note.trim() ? { note: entry.note.trim() } : {}),
        }
      })
      .filter((item): item is VocabularyEntry => item !== null)

    const overviewText = typeof overview === 'string' ? overview.trim() : ''
    if (overviewText || grammarPoints.length || vocabulary.length) {
      return {
        overview: overviewText,
        rubyTokens,
        grammarPoints,
        vocabulary,
      }
    }
  } catch {
    // Some OpenAI-compatible providers ignore JSON-only instructions.
  }

  return {
    overview: content.trim(),
    rubyTokens: [],
    grammarPoints: [],
    vocabulary: [],
  }
}

export function parseExampleResult(content: string): ExampleResult {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<{ sentences: unknown; examples: unknown }>
    const rawSentences = Array.isArray(parsed.sentences)
      ? parsed.sentences
      : Array.isArray(parsed.examples)
        ? parsed.examples
        : []
    const sentences = rawSentences
      .map((item) => {
        const entry = item as Partial<ExampleSentence>
        if (typeof entry.text !== 'string' || !entry.text.trim()) return null
        return {
          text: entry.text.trim(),
          ...(typeof entry.reading === 'string' && entry.reading.trim() ? { reading: entry.reading.trim() } : {}),
          ...(typeof entry.translation === 'string' && entry.translation.trim()
            ? { translation: entry.translation.trim() }
            : {}),
        }
      })
      .filter((item): item is ExampleSentence => item !== null)

    if (sentences.length) return { sentences }
  } catch {
    // Some OpenAI-compatible providers ignore JSON-only instructions.
  }

  return { sentences: [{ text: content.trim() }] }
}

export function parseTranslation(content: string): TranslationResult {
  try {
    const parsed = JSON.parse(extractJsonContent(content)) as Partial<TranslationResult>
    const sourceText = parseSourceText(parsed)
    const maybeTranslations = parsed.translations
    if (Array.isArray(maybeTranslations)) {
      const translations = maybeTranslations
        .map((item) => {
          const translation = item as Partial<TranslationVariant>
          if (typeof translation.tone !== 'string' || typeof translation.text !== 'string') return null
          return {
            tone: translation.tone,
            text: translation.text,
            ...(typeof translation.pinyin === 'string' && translation.pinyin.trim()
              ? { pinyin: translation.pinyin }
              : {}),
            ...(typeof translation.reading === 'string' && translation.reading.trim()
              ? { reading: translation.reading }
              : {}),
          }
        })
        .filter((item): item is TranslationVariant => item !== null)

      if (!translations.length) {
        throw new Error('No translations in JSON response.')
      }

      return {
        translations,
        notes: parseNotes(parsed.notes),
        ...(sourceText ? { sourceText } : {}),
      }
    }

    const legacy = parsed as Partial<{ translatedText: string }>
    if (typeof legacy.translatedText === 'string') {
      return {
        translations: [{ tone: 'Natural', text: legacy.translatedText }],
        notes: parseNotes(parsed.notes),
        ...(sourceText ? { sourceText } : {}),
      }
    }
  } catch {
    // Some OpenAI-compatible providers ignore JSON-only instructions.
  }

  return {
    translations: [{ tone: 'Natural', text: content.trim() }],
    notes: [],
  }
}

