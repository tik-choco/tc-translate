import { LoaderCircle, NotebookText } from 'lucide-preact'
import { memo } from 'preact/compat'
import { t } from '../i18n'
import { detectScript, speechCodeForScript } from '../lib/language'
import { ProviderSetupGuide } from './ProviderSetupGuide'
import { SpeechControls } from './SpeechControls'
import type { ExampleResult, Status } from '../types'

type ExampleOutputProps = {
  status: Status
  result: ExampleResult | null
  speechSupported: boolean
  speakingId: string | null
  speechLoadingId: string | null
  onSpeak: (text: string, lang: string | undefined, id: string) => void
  speechDownloadSupported: boolean
  speechDownloadingId: string | null
  onDownloadSpeech: (text: string, id: string) => void
  providerNeedsSetup: boolean
  onOpenSettings: () => void
}

export const ExampleOutput = memo(function ExampleOutput({
  status,
  result,
  speechSupported,
  speakingId,
  speechLoadingId,
  onSpeak,
  speechDownloadSupported,
  speechDownloadingId,
  onDownloadSpeech,
  providerNeedsSetup,
  onOpenSettings,
}: ExampleOutputProps) {
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
          <div class="explain-speakable-row">
            <p class="explain-pattern">{sentence.text}</p>
            <SpeechControls
              text={sentence.text}
              // The example is written in the source word's own language, so
              // the script is the only language hint available here.
              lang={speechCodeForScript(detectScript(sentence.text))}
              id={`example-${index}`}
              label={t('translator-listen-sentence')}
              supported={speechSupported}
              speakingId={speakingId}
              loadingId={speechLoadingId}
              onSpeak={onSpeak}
              downloadSupported={speechDownloadSupported}
              downloadingId={speechDownloadingId}
              onDownload={onDownloadSpeech}
            />
          </div>
          {sentence.reading ? <p class="explain-example">{sentence.reading}</p> : null}
          {sentence.translation ? <p>{sentence.translation}</p> : null}
        </article>
      ))}
    </section>
  )
})
