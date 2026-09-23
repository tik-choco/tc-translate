import { t } from '../../i18n'
import { getJaReadings, katakanaToHiragana, type KunReading } from './jaReadings'
import { getPinyinCandidates, pinyinToZhuyin, type RubyToken } from './pinyinZhuyin'

const HAN = /\p{Script=Han}/u

type ZhReadingDetailsProps = {
  token: RubyToken
  script: 'pinyin' | 'zhuyin'
}

// Chinese tokens are always a single character: list every reading it can
// take, marking the one pinyin-pro picked for this context.
export function ZhReadingDetails({ token, script }: ZhReadingDetailsProps) {
  const candidates = getPinyinCandidates(token.text)
  return (
    <div class="kanji-details">
      <div class="kanji-details-head">
        <span class="kanji-details-char">{token.text}</span>
        {token.reading ? <span class="kanji-details-reading">{token.reading}</span> : null}
      </div>
      {candidates.length > 1 ? (
        <div class="kanji-details-section">
          <span class="kanji-details-label">{t('kanji-popover-all-readings')}</span>
          <ul class="kanji-details-list">
            {candidates.map((py) => {
              const shown = script === 'zhuyin' ? pinyinToZhuyin(py) : py
              return (
                <li key={py} class={shown === token.reading ? 'current' : ''}>
                  {shown}
                  {script === 'zhuyin' ? <span class="kanji-details-note">{py}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function KunItem({ reading }: { reading: KunReading }) {
  return (
    <>
      {reading.affix ? '〜' : null}
      {reading.stem}
      {reading.okurigana ? <span class="kanji-details-okurigana">{reading.okurigana}</span> : null}
    </>
  )
}

// A dictionary reading "matches" the in-context one when it appears inside
// it: exact for a lone kanji (生/なま), a substring for compounds (学校/がっこう
// → コウ). Sound changes (がく → がっ) go unmarked, which is fine for a hint.
function readingMatches(contextReading: string, candidate: string, lone: boolean): boolean {
  if (!contextReading || !candidate) return false
  const hira = katakanaToHiragana(candidate)
  if (lone) return contextReading === hira
  // One-kana readings (日 → ひ) would light up in almost any compound.
  return hira.length >= 2 && contextReading.includes(hira)
}

export function JaReadingDetails({ token }: { token: RubyToken }) {
  const kanji = Array.from(new Set(Array.from(token.text).filter((char) => HAN.test(char))))
  const reading = katakanaToHiragana(token.reading)
  const lone = kanji.length === 1 && Array.from(token.text).length === 1
  return (
    <div class="kanji-details">
      <div class="kanji-details-head">
        <span class="kanji-details-char">{token.text}</span>
        {token.reading ? (
          <span class="kanji-details-reading" title={t('kanji-popover-in-context')}>
            {token.reading}
          </span>
        ) : null}
      </div>
      {kanji.map((char) => {
        const entry = getJaReadings(char)
        return (
          <div key={char} class="kanji-details-section">
            {kanji.length > 1 ? <span class="kanji-details-subchar">{char}</span> : null}
            {!entry ? (
              <span class="kanji-details-empty">{t('kanji-popover-no-data')}</span>
            ) : (
              <>
                {entry.on.length > 0 ? (
                  <div class="kanji-details-row">
                    <span class="kanji-details-label">{t('kanji-popover-on')}</span>
                    <ul class="kanji-details-list">
                      {entry.on.map((on) => (
                        <li key={on} class={readingMatches(reading, on, lone) ? 'current' : ''}>
                          {on}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {entry.kun.length > 0 ? (
                  <div class="kanji-details-row">
                    <span class="kanji-details-label">{t('kanji-popover-kun')}</span>
                    <ul class="kanji-details-list">
                      {entry.kun.map((kun) => (
                        <li
                          key={kun.stem + kun.okurigana + kun.affix}
                          class={readingMatches(reading, kun.stem, lone) ? 'current' : ''}
                        >
                          <KunItem reading={kun} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
