import { LoaderCircle, NotebookText } from 'lucide-preact'
import { memo } from 'preact/compat'
import { t } from '../i18n'
import { ProviderSetupGuide } from './ProviderSetupGuide'
import type { ExampleResult, Status } from '../types'

type ExampleOutputProps = {
  status: Status
  result: ExampleResult | null
  providerNeedsSetup: boolean
  onOpenSettings: () => void
}

export const ExampleOutput = memo(function ExampleOutput({ status, result, providerNeedsSetup, onOpenSettings }: ExampleOutputProps) {
  if (status === 'loading') {
    return (
      <span class="loading-line">
        <LoaderCircle size={18} />
        {t('translator-generating-examples')}
      </span>
    )
  }

  if (!result) {
    if (providerNeedsSetup) {
      return <ProviderSetupGuide onOpenSettings={onOpenSettings} />
    }

    return (
      <div class="empty-state">
        <NotebookText size={22} />
        <span>{t('translator-examples-empty')}</span>
      </div>
    )
  }

  return (
    <section class="explain-section">
      {result.sentences.map((sentence, index) => (
        <article class="explain-point-card" key={`${sentence.text}-${index}`}>
          <p class="explain-pattern">{sentence.text}</p>
          {sentence.reading ? <p class="explain-example">{sentence.reading}</p> : null}
          {sentence.translation ? <p>{sentence.translation}</p> : null}
        </article>
      ))}
    </section>
  )
})
