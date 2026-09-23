// Regenerates src/features/kanji/ja-readings.json — the offline on'yomi /
// kun'yomi table behind the Kanji tab's reading popover — from KANJIDIC2.
//
//   node scripts/build-kanji-readings.mjs [path/to/kanjidic2.xml(.gz)]
//
// With no argument the latest kanjidic2.xml.gz is downloaded from EDRDG.
// The output is committed, so this only needs re-running to pick up
// dictionary updates; it is not part of dev/build.
//
// KANJIDIC2 is © the Electronic Dictionary Research and Development Group,
// used under CC BY-SA 4.0 (https://www.edrdg.org/edrdg/licence.html).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const SOURCE_URL = 'https://www.edrdg.org/kanjidic/kanjidic2.xml.gz'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kanjiDir = resolve(root, 'src/features/kanji')
const outPath = resolve(kanjiDir, 'ja-readings.json')

async function loadXml() {
  const arg = process.argv[2]
  const raw = arg ? readFileSync(arg) : Buffer.from(await (await fetch(SOURCE_URL)).arrayBuffer())
  const isGzip = raw[0] === 0x1f && raw[1] === 0x8b
  return (isGzip ? gunzipSync(raw) : raw).toString('utf8')
}

const xml = await loadXml()

// Every character the converter can emit on the Japanese row must be covered,
// even the rare ones outside JIS X 0208.
const kanjiMap = JSON.parse(readFileSync(resolve(kanjiDir, 'kanji-map.json'), 'utf8'))
const mapChars = new Set(kanjiMap.ja.filter(Boolean))

const readings = {}
for (const [, body] of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
  const literal = body.match(/<literal>(.*?)<\/literal>/)?.[1]
  if (!literal) continue
  // Jōyō/jinmeiyō (grade) plus JIS level 1/2 covers ordinary Japanese text
  // while leaving out ~6,000 obscure JIS X 0212/0213 characters.
  const common = /<grade>/.test(body) || /cp_type="jis208"/.test(body)
  if (!common && !mapChars.has(literal)) continue
  const on = [...body.matchAll(/<reading r_type="ja_on">(.*?)<\/reading>/g)].map((m) => m[1])
  const kun = [...body.matchAll(/<reading r_type="ja_kun">(.*?)<\/reading>/g)].map((m) => m[1])
  if (on.length === 0 && kun.length === 0) continue
  // Compact "オン オン|くん くん" string per character keeps the JSON small.
  readings[literal] = `${on.join(' ')}|${kun.join(' ')}`
}

writeFileSync(outPath, JSON.stringify(readings))
console.log(`Wrote ${Object.keys(readings).length} entries to ${outPath}`)
