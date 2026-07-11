import { BookOpen, LoaderCircle } from 'lucide-preact'
import { memo } from 'preact/compat'
import { t } from '../i18n'
import { ProviderSetupGuide } from './ProviderSetupGuide'
import type { ExplanationResult, ExplanationRubyToken, Status } from '../types'

type ExplainOutputProps = {
  status: Status
  result: ExplanationResult | null
  rubyStatus: Status
  rubyTokens: ExplanationRubyToken[]
  providerNeedsSetup: boolean
  onOpenSettings: () => void
}

export const ExplainOutput = memo(function ExplainOutput({
  status,
  result,
  rubyStatus,
  rubyTokens,
  providerNeedsSetup,
  onOpenSettings,
}: ExplainOutputProps) {
  if (status === 'loading') {
    return (
      <span class="loading-line">
        <LoaderCircle size={18} />
        {t('translator-explaining')}
      </span>
    )
  }

  if (!result) {
    if (providerNeedsSetup) {
      return <ProviderSetupGuide onOpenSettings={onOpenSettings} />
    }

    return (
      <div class="empty-state">
        <BookOpen size={22} />
        <span>{t('translator-explanation-empty')}</span>
      </div>
    )
  }

  const hasReadings = rubyTokens.some((token) => token.reading)

  return (
    <>
      {rubyStatus === 'loading' ? (
        <article class="explain-card explain-ruby-card">
          <header>
            <span>{t('translator-reading-label')}</span>
          </header>
          <span class="loading-line">
            <LoaderCircle size={18} />
            {t('translator-reading-loading')}
          </span>
        </article>
      ) : rubyStatus === 'done' && hasReadings ? (
        <article class="explain-card explain-ruby-card">
          <header>
            <span>{t('translator-reading-label')}</span>
          </header>
          <div class="explain-ruby">
            {rubyTokens.map((token, index) =>
              token.reading ? (
                <ruby key={index}>
                  {token.text}
                  <rt>{token.reading}</rt>
                </ruby>
              ) : (
                <span key={index}>{token.text}</span>
              ),
            )}
          </div>
        </article>
      ) : null}
      {result.overview ? (
        <article class="explain-card">
          <header>
            <span>{t('translator-overview-label')}</span>
          </header>
          <p class="explain-overview">{result.overview}</p>
        </article>
      ) : null}
      {result.grammarPoints.length ? (
        <section class="explain-section">
          <h3 class="explain-section-title">{t('translator-grammar-label')}</h3>
          {result.grammarPoints.map((point, index) => (
            <article class="explain-point-card" key={`${point.pattern}-${index}`}>
              <span class="explain-pattern">{point.pattern}</span>
              <p>{point.explanation}</p>
              {point.example ? <p class="explain-example">{point.example}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
      {result.vocabulary.length ? (
        <section class="explain-section">
          <h3 class="explain-section-title">{t('translator-vocabulary-label')}</h3>
          {result.vocabulary.map((entry, index) => (
            <article class="explain-vocab-card" key={`${entry.word}-${index}`}>
              <div class="explain-vocab-row">
                <span class="explain-word">{entry.word}</span>
                {entry.reading ? <span class="explain-reading">{entry.reading}</span> : null}
              </div>
              <p class="explain-meaning">{entry.meaning}</p>
              {entry.note ? <p class="explain-note">{entry.note}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </>
  )
})
