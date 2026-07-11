import kanjiMap from './kanji-map.json'

export type KanjiCountryCode = 'ja' | 'zh-TW' | 'zh-CN'

const countryCodes: KanjiCountryCode[] = ['ja', 'zh-TW', 'zh-CN']

const table = kanjiMap as Record<KanjiCountryCode, string[]>

function buildCharMap(type: KanjiCountryCode): Map<string, string> {
  const map = new Map<string, string>()
  for (const code of countryCodes) {
    if (code === type) continue
    table[code].forEach((source, index) => {
      const target = table[type][index]
      if (source && target) map.set(source, target)
    })
  }
  return map
}

const charMapsByType = new Map(countryCodes.map((type) => [type, buildCharMap(type)] as const))

// A single left-to-right character pass avoids the bug in the naive approach of
// running one text.replaceAll(source, target) per table row: with 3050+ rows some
// pairs are reciprocal (e.g. 冊/册), so sequential whole-string replacements on an
// accumulating string can round-trip a character back to its original value.
export function translateKanji(type: KanjiCountryCode, sourceText: string): string {
  const map = charMapsByType.get(type)!
  return Array.from(sourceText)
    .map((char) => map.get(char) ?? char)
    .join('')
}
