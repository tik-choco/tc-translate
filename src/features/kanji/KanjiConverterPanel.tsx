import { LoaderCircle, RefreshCw, Sparkles } from 'lucide-preact'
import type { ComponentChildren } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { t } from '../../i18n'
import type { ProviderSettings } from '../../types'
import { translateKanji } from './kanjiConversion'
import { type RubyToken, toPinyinRuby, toZhuyinRuby } from './pinyinZhuyin'
import { JaReadingDetails, ZhReadingDetails } from './ReadingDetails'
import { RubyText } from './RubyText'
import { useFurigana } from './useFurigana'
import './kanji.css'

const CONVERSION_DEBOUNCE_MS = 200
const HAN = /\p{Script=Han}/u

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

const renderPinyinDetails = (token: RubyToken) => <ZhReadingDetails token={token} script="pinyin" />
const renderZhuyinDetails = (token: RubyToken) => <ZhReadingDetails token={token} script="zhuyin" />
const renderJaDetails = (token: RubyToken) => <JaReadingDetails token={token} />

type KanjiResultRowProps = {
  label: string
  readingLabel: string
  ruby: RubyToken[]
  renderDetails: (token: RubyToken) => ComponentChildren
  actions?: ComponentChildren
  footer?: ComponentChildren
}

function KanjiResultRow({ label, readingLabel, ruby, renderDetails, actions, footer }: KanjiResultRowProps) {
  return (
    <section class="kanji-result">
      <div class="kanji-result-header">
        <span class="kanji-result-label">{label}</span>
        <div class="kanji-result-actions">
          {actions}
          <span class="kanji-result-reading">{readingLabel}</span>
        </div>
      </div>
      <RubyText tokens={ruby} renderDetails={renderDetails} />
      {footer}
    </section>
  )
}

type KanjiConverterPanelProps = {
  settings: ProviderSettings
  providerNeedsSetup: boolean
  onOpenSettings: () => void
}

function KanjiConverterPanelImpl({ settings, providerNeedsSetup, onOpenSettings }: KanjiConverterPanelProps) {
  const [source, setSource] = useState('')
  const debouncedSource = useDebouncedValue(source, CONVERSION_DEBOUNCE_MS)

  // The character map converts from any of the three scripts, so a single
  // input accepts Japanese, Simplified, or Traditional text alike.
  const cn = useMemo(() => translateKanji('zh-CN', debouncedSource), [debouncedSource])
  const tw = useMemo(() => translateKanji('zh-TW', debouncedSource), [debouncedSource])
  const ja = useMemo(() => translateKanji('ja', debouncedSource), [debouncedSource])

  const cnRuby = useMemo(() => toPinyinRuby(cn), [cn])
  const twRuby = useMemo(() => toZhuyinRuby(tw), [tw])

  // Pinyin and zhuyin come from pinyin-pro's phrase dictionary offline, but a
  // Japanese kanji's reading depends on the word and context (生: せい, しょう,
  // なま, い(きる)…) in ways no small offline table resolves. So the Japanese
  // row shows no ruby by default — each kanji still lists its on/kun readings
  // on hover — and context-correct furigana is one LLM call away.
  const furigana = useFurigana(settings, ja)
  const jaPlain = useMemo(() => Array.from(ja, (char) => ({ text: char, reading: '' })), [ja])
  const jaRuby = furigana.tokens ?? jaPlain
  const jaHasKanji = HAN.test(ja)

  const furiganaButton = (
    <button
      type="button"
      class="secondary-button kanji-furigana-button"
      disabled={!jaHasKanji || furigana.status === 'loading'}
      onClick={() => (providerNeedsSetup ? onOpenSettings() : void furigana.generate())}
      title={providerNeedsSetup ? t('kanji-furigana-setup') : t('kanji-furigana-generate-title')}
    >
      {furigana.status === 'loading' ? (
        <LoaderCircle size={14} class="spin" />
      ) : furigana.tokens ? (
        <RefreshCw size={14} />
      ) : (
        <Sparkles size={14} />
      )}
      {furigana.status === 'loading'
        ? t('kanji-furigana-loading')
        : furigana.tokens
          ? t('kanji-furigana-regenerate')
          : t('kanji-furigana-generate')}
    </button>
  )

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
        <span class="kanji-source-hint">{t('kanji-hover-hint')}</span>
      </div>
      <div class="kanji-results">
        <KanjiResultRow
          label={t('kanji-label-cn')}
          readingLabel={t('kanji-ruby-pinyin-placeholder')}
          ruby={cnRuby}
          renderDetails={renderPinyinDetails}
        />
        <KanjiResultRow
          label={t('kanji-label-tw')}
          readingLabel={t('kanji-ruby-zhuyin-placeholder')}
          ruby={twRuby}
          renderDetails={renderZhuyinDetails}
        />
        <KanjiResultRow
          label={t('kanji-label-ja')}
          readingLabel={t('kanji-ruby-furigana')}
          ruby={jaRuby}
          renderDetails={renderJaDetails}
          actions={furiganaButton}
          footer={
            furigana.status === 'error' ? (
              <span class="error-text">
                {t('kanji-furigana-error')}
                {furigana.error ? `: ${furigana.error}` : ''}
              </span>
            ) : null
          }
        />
      </div>
      {/* Required on every screen showing KANJIDIC2 data by the EDRDG licence. */}
      <p class="kanji-attribution">
        {t('kanji-attribution')}{' '}
        <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer">
          KANJIDIC2
        </a>{' '}
        (
        <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">
          EDRDG, CC BY-SA 4.0
        </a>
        )
      </p>
    </div>
  )
}

export const KanjiConverterPanel = memo(KanjiConverterPanelImpl)
