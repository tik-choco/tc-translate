import { memo } from 'preact/compat'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { t } from '../../i18n'
import { translateKanji } from './kanjiConversion'
import { type RubyToken, toPinyinRuby, toZhuyinRuby } from './pinyinZhuyin'
import { RubyText } from './RubyText'
import './kanji.css'

const CONVERSION_DEBOUNCE_MS = 200

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

type KanjiResultRowProps = {
  label: string
  readingLabel?: string
  text: string
  ruby?: RubyToken[]
}

function KanjiResultRow({ label, readingLabel, text, ruby }: KanjiResultRowProps) {
  return (
    <section class="kanji-result">
      <div class="kanji-result-header">
        <span class="kanji-result-label">{label}</span>
        {readingLabel ? <span class="kanji-result-reading">{readingLabel}</span> : null}
      </div>
      {ruby ? <RubyText tokens={ruby} /> : <div class="kanji-result-text">{text}</div>}
    </section>
  )
}

function KanjiConverterPanelImpl() {
  const [source, setSource] = useState('')
  const debouncedSource = useDebouncedValue(source, CONVERSION_DEBOUNCE_MS)

  // The character map converts from any of the three scripts, so a single
  // input accepts Japanese, Simplified, or Traditional text alike.
  const cn = useMemo(() => translateKanji('zh-CN', debouncedSource), [debouncedSource])
  const tw = useMemo(() => translateKanji('zh-TW', debouncedSource), [debouncedSource])
  const ja = useMemo(() => translateKanji('ja', debouncedSource), [debouncedSource])

  const cnRuby = useMemo(() => toPinyinRuby(cn), [cn])
  const twRuby = useMemo(() => toZhuyinRuby(tw), [tw])

  return (
    <div class="kanji-panel">
      <div class="kanji-source">
        <label class="kanji-source-label" for="kanji-source-input">
          {t('kanji-input-label')}
        </label>
        <textarea
          id="kanji-source-input"
          class="kanji-source-input"
          rows={3}
          value={source}
          placeholder={t('kanji-input-placeholder')}
          onInput={(event) => setSource((event.target as HTMLTextAreaElement).value)}
        />
      </div>
      <div class="kanji-results">
        <KanjiResultRow
          label={t('kanji-label-cn')}
          readingLabel={t('kanji-ruby-pinyin-placeholder')}
          text={cn}
          ruby={cnRuby}
        />
        <KanjiResultRow
          label={t('kanji-label-tw')}
          readingLabel={t('kanji-ruby-zhuyin-placeholder')}
          text={tw}
          ruby={twRuby}
        />
        <KanjiResultRow label={t('kanji-label-ja')} text={ja} />
      </div>
    </div>
  )
}

export const KanjiConverterPanel = memo(KanjiConverterPanelImpl)
