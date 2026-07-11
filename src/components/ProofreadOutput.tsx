import { Check, Clipboard, LoaderCircle, PenLine, Square, Volume2 } from 'lucide-preact'
import { memo } from 'preact/compat'
import { t } from '../i18n'
import { speechCodeForLanguage } from '../lib/language'
import { ProviderSetupGuide } from './ProviderSetupGuide'
import type { ProofreadResult, Status } from '../types'

type ProofreadOutputProps = {
  status: Status
  result: ProofreadResult | null
  copied: boolean
  onCopy: () => void
  nativeLanguage: string
  speechSupported: boolean
  speakingId: string | null
  speechLoadingId: string | null
  onSpeak: (text: string, lang: string | undefined, id: string) => void
  providerNeedsSetup: boolean
  onOpenSettings: () => void
}

const proofreadSpeechId = 'proofread-corrected'

export const ProofreadOutput = memo(function ProofreadOutput({
  status,
  result,
  copied,
  onCopy,
  nativeLanguage,
  speechSupported,
  speakingId,
  speechLoadingId,
  onSpeak,
  providerNeedsSetup,
  onOpenSettings,
}: ProofreadOutputProps) {
  if (status === 'loading') {
    return (
      <span class="loading-line">
        <LoaderCircle size={18} />
        {t('translator-proofreading')}
      </span>
    )
  }

  if (!result) {
    if (providerNeedsSetup) {
      return <ProviderSetupGuide onOpenSettings={onOpenSettings} />
    }

    return (
      <div class="empty-state">
        <PenLine size={22} />
        <span>{t('translator-corrections-empty')}</span>
      </div>
    )
  }

  return (
    <>
      <article class="proofread-card">
        <header>
          <span>{t('translator-corrected-text')}</span>
          <div class="copy-control">
            {speechSupported ? (
              <button
                type="button"
                class="icon-button small"
                onClick={() => onSpeak(result.correctedText, speechCodeForLanguage(nativeLanguage), proofreadSpeechId)}
                title={speakingId === proofreadSpeechId ? t('translator-stop-reading') : t('translator-listen-corrected')}
                aria-label={
                  speakingId === proofreadSpeechId ? t('translator-stop-reading') : t('translator-listen-corrected')
                }
              >
                {speechLoadingId === proofreadSpeechId ? (
                  <LoaderCircle size={18} class="spin" />
                ) : speakingId === proofreadSpeechId ? (
                  <Square size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>
            ) : null}
            <button
              type="button"
              class={`icon-button small ${copied ? 'copy-success' : ''}`}
              onClick={onCopy}
              title={t('translator-copy-corrected')}
              aria-label={t('translator-copy-corrected')}
            >
              {copied ? <Check size={18} /> : <Clipboard size={18} />}
            </button>
          </div>
        </header>
        <pre>{result.correctedText}</pre>
      </article>
      <section class="corrections-list">
        {result.corrections.length ? (
          result.corrections.map((correction, index) => (
            <article class="correction-card" key={`${correction.before}-${index}`}>
              <div class="correction-change">
                <del>{correction.before}</del>
                <span aria-hidden="true">-&gt;</span>
                <ins>{correction.after}</ins>
              </div>
              <p>{correction.reason}</p>
            </article>
          ))
        ) : (
          <p class="no-corrections">{t('translator-no-corrections')}</p>
        )}
      </section>
      {result.summary ? <p class="proofread-summary">{result.summary}</p> : null}
    </>
  )
})
