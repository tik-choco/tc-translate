import { requestChatCompletion } from '../../lib/llm'
import { parseExplanationRuby } from '../../lib/parse'
import type { ProviderSettings } from '../../types'
import { katakanaToHiragana } from './jaReadings'
import type { RubyToken } from './pinyinZhuyin'

const HAN = /\p{Script=Han}/u
const KANA = /[ぁ-ゖァ-ヺー]/

const FURIGANA_PROMPT =
  'You add furigana to Japanese text. Return only JSON of the shape {"ruby": [{"text": "...", "reading": "..."}]}. ' +
  'The "text" values must concatenate to the input text exactly, in order, keeping every character including spaces and line breaks. ' +
  'Split the text into words. Give every token that contains kanji a "reading" in hiragana, as the word is actually read in this context ' +
  '(e.g. 今日 → きょう or こんにち, 一日 → ついたち or いちにち, 生 in 生ビール → なま). ' +
  'Put okurigana and other kana in their own tokens without a reading (食べる → {"text":"食","reading":"た"},{"text":"べる"}), ' +
  'but keep jukujikun and ateji such as 大人 or 明日 as one token. Omit "reading" for tokens without kanji.'

// The model occasionally drifts from the input (normalized punctuation,
// dropped whitespace, a stray extra token). Walk the text and slot each token
// in where it actually occurs, leaving anything unmatched as plain text,
// rather than rejecting the whole result over a one-character mismatch.
function alignToText(text: string, tokens: { text: string; reading?: string }[]): RubyToken[] {
  const aligned: RubyToken[] = []
  let pos = 0
  for (const token of tokens) {
    const at = text.indexOf(token.text, pos)
    if (at === -1 || at - pos > 8) continue
    if (at > pos) aligned.push({ text: text.slice(pos, at), reading: '' })
    aligned.push({ text: token.text, reading: HAN.test(token.text) ? (token.reading ?? '') : '' })
    pos = at + token.text.length
  }
  if (pos < text.length) aligned.push({ text: text.slice(pos), reading: '' })
  return aligned
}

// Splits kana the model left attached to a kanji token (食べる/たべる) off
// both ends, so the ruby sits over the kanji alone: 食/た + べる.
function splitOkurigana(token: RubyToken): RubyToken[] {
  if (!token.reading) return [token]
  const chars = Array.from(token.text)
  const reading = Array.from(katakanaToHiragana(token.reading))
  let head = 0
  while (
    head < chars.length - 1 &&
    KANA.test(chars[head]) &&
    katakanaToHiragana(chars[head]) === reading[head]
  ) head += 1
  let tail = 0
  while (
    tail < chars.length - head - 1 &&
    KANA.test(chars[chars.length - 1 - tail]) &&
    katakanaToHiragana(chars[chars.length - 1 - tail]) === reading[reading.length - 1 - tail]
  ) tail += 1
  const core = chars.slice(head, chars.length - tail).join('')
  const coreReading = reading.slice(head, reading.length - tail).join('')
  if (!HAN.test(core) || coreReading === '') return [token]
  const parts: RubyToken[] = []
  if (head > 0) parts.push({ text: chars.slice(0, head).join(''), reading: '' })
  parts.push({ text: core, reading: coreReading })
  if (tail > 0) parts.push({ text: chars.slice(chars.length - tail).join(''), reading: '' })
  return parts
}

export async function generateFurigana(params: {
  settings: ProviderSettings
  text: string
  signal?: AbortSignal
}): Promise<RubyToken[]> {
  const content = await requestChatCompletion({
    settings: params.settings,
    signal: params.signal,
    messages: [
      { role: 'system', content: FURIGANA_PROMPT },
      { role: 'user', content: JSON.stringify({ text: params.text }) },
    ],
  })
  const tokens = parseExplanationRuby(content)
  if (tokens.length === 0) throw new Error('Empty furigana response')
  return alignToText(params.text, tokens).flatMap(splitOkurigana)
}
