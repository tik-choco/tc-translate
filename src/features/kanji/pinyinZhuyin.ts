import { pinyin } from 'pinyin-pro'
import { fromPinyin } from 'zhuyin'

export type RubyToken = { text: string; reading: string }

const HAN = /\p{Script=Han}/u

// Tone marks used by the zhuyin library (index = tone - 1). Tone 4 is a grave
// accent and tone 5 (neutral) a middle dot, matching fromPinyin's own output.
const TONE_MARKS = ['', 'ˊ', 'ˇ', '`', '˙']

// pinyin() emits ü-finals after l/n (綠 lǜ, 女 nǚ, 略 lüè …) that the zhuyin
// library fails to map (it returns "undefined"), so we cover them ourselves.
const U_FINALS: Record<string, string> = {
  lü: 'ㄌㄩ',
  lüe: 'ㄌㄩㄝ',
  nü: 'ㄋㄩ',
  nüe: 'ㄋㄩㄝ',
}

const TONE_VOWELS: Record<string, [base: string, tone: number]> = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
}

function splitTone(syllable: string): { base: string; tone: number } {
  let base = ''
  let tone = 5
  for (const ch of syllable) {
    const mapped = TONE_VOWELS[ch]
    if (mapped) {
      base += mapped[0]
      tone = mapped[1]
    } else {
      base += ch
    }
  }
  return { base, tone }
}

function toZhuyinSyllable(py: string): string {
  if (py === '') return ''
  const zy = fromPinyin(py).join('')
  if (zy !== '' && !zy.includes('undefined')) return zy
  const { base, tone } = splitTone(py)
  const mapped = U_FINALS[base]
  if (mapped) return mapped + TONE_MARKS[tone - 1]
  return py // last resort: show pinyin rather than a broken glyph
}

const PINYIN_CACHE_LIMIT = 500
const pinyinCache = new Map<string, string[]>()

function convertRunToSyllables(run: string): string[] {
  const syllables = pinyin(run, { type: 'array', nonZh: 'consecutive' })
  if (syllables.length === Array.from(run).length) return syllables
  return Array.from(run).map((char) => pinyin(char, { type: 'array', nonZh: 'consecutive' })[0] ?? '')
}

function getPinyinSyllables(run: string): string[] {
  const cached = pinyinCache.get(run)
  if (cached) {
    pinyinCache.delete(run)
    pinyinCache.set(run, cached)
    return cached
  }
  const syllables = convertRunToSyllables(run)
  if (pinyinCache.size >= PINYIN_CACHE_LIMIT) {
    const oldestKey = pinyinCache.keys().next().value
    if (oldestKey !== undefined) pinyinCache.delete(oldestKey)
  }
  pinyinCache.set(run, syllables)
  return syllables
}

function buildRuby(text: string, convert: (py: string) => string): RubyToken[] {
  const chars = Array.from(text)
  const tokens: RubyToken[] = []
  let i = 0
  while (i < chars.length) {
    if (!HAN.test(chars[i])) {
      tokens.push({ text: chars[i], reading: '' })
      i += 1
      continue
    }
    // Convert whole runs of Han characters together: the pinyin library aligns
    // one syllable per character within a pure-Han run and still applies its
    // phrase readings (音樂 → lè). Mixing in punctuation would let it group
    // several characters into one entry and break the index alignment.
    let end = i
    while (end < chars.length && HAN.test(chars[end])) end += 1
    const run = chars.slice(i, end)
    const syllables = getPinyinSyllables(run.join(''))
    run.forEach((char, k) => {
      const py = syllables[k] ?? ''
      const reading = convert(py)
      tokens.push({ text: char, reading: reading === char ? '' : reading })
    })
    i = end
  }
  return tokens
}

export function toPinyinRuby(text: string): RubyToken[] {
  return buildRuby(text, (py) => py)
}

export function toZhuyinRuby(text: string): RubyToken[] {
  return buildRuby(text, toZhuyinSyllable)
}
