import { ArrowLeftRight, Check, HeartHandshake, Clipboard, Download, LoaderCircle, RefreshCw, ScrollText, Square, Volume2 } from 'lucide-preact'
import { memo } from 'preact/compat'
import { t } from '../i18n'
import { speechCodeForLanguage, toneDisplayName } from '../lib/language'
import { nuanceSummary } from './NuancePicker'
import { ProviderSetupGuide } from './ProviderSetupGuide'
import type {
  BackTranslationCheck,
  Status,
  TranslationHistoryItem,
  TranslationResult,
  TranslationVariant,
} from '../types'

type TranslationOutputProps = {
  status: Status
  selectedHistory: TranslationHistoryItem | null
  result: TranslationResult | null
  // Partial translations shown while the request is still streaming.
  streamingTranslations: TranslationVariant[]
  targetLanguage: string
  copiedTone: string
  onCopyTranslation: (translation: TranslationVariant) => void
  backTranslationStatus: Status
  canCheckBackTranslation: boolean
  onCheckBackTranslation: () => void
  backTranslation: BackTranslationCheck | null
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

export const TranslationOutput = memo(function TranslationOutput({
  status,
  selectedHistory,
  result,
  streamingTranslations,
  targetLanguage,
  copiedTone,
  onCopyTranslation,
  backTranslationStatus,
  canCheckBackTranslation,
  onCheckBackTranslation,
  backTranslation,
  speechSupported,
  speakingId,
  speechLoadingId,
  onSpeak,
  speechDownloadSupported,
  speechDownloadingId,
  onDownloadSpeech,
  providerNeedsSetup,
  onOpenSettings,
}: TranslationOutputProps) {
  const hasTranslations = Boolean(result?.translations.length)
  // Only one tone (Natural) is generated now; the tone name only tells
  // translations apart in older history items that have several.
  const showToneLabels = (result?.translations.length ?? 0) > 1
  const speechLang = speechCodeForLanguage(result?.translatedLanguage ?? targetLanguage)
  const appliedNuance = nuanceSummary(result?.nuance)

  return (
    <>
      {selectedHistory ? (
        <div class="selected-history">
          <span>{t('history-selected-label')}</span>
          <strong>{selectedHistory.sourceText}</strong>
        </div>
      ) : null}
      {result?.reversed ? (
        <div class="reversed-badge">
          <ArrowLeftRight size={14} />
          {t('translator-direction-reversed', { language: result.translatedLanguage ?? targetLanguage })}
        </div>
      ) : null}
      {appliedNuance && status !== 'loading' ? (
        <div class="reversed-badge nuance-badge">
          <HeartHandshake size={14} />
          {t('translator-nuance-applied', { nuance: appliedNuance })}
        </div>
      ) : null}
      {status === 'loading' && streamingTranslations.length ? (
        // Read-only while streaming: copy/speak/tones appear once it's done.
        <div class="bubble-list" aria-busy="true">
          {streamingTranslations.map((translation) => (
            <article class="tone-window streaming" key={translation.tone}>
              <header>
                {streamingTranslations.length > 1 ? <span>{toneDisplayName(translation.tone)}</span> : null}
                <LoaderCircle size={16} class="spin" aria-label={t('translator-translating')} />
              </header>
              <div class="tone-body">
                <pre>{translation.text}</pre>
              </div>
            </article>
          ))}
        </div>
      ) : status === 'loading' ? (
        <span class="loading-line">
          <LoaderCircle size={18} />
          {t('translator-translating')}
        </span>
      ) : hasTranslations ? (
        <div class="bubble-list">
          {result?.translations.map((translation) => {
            const speechId = `translation-${translation.tone}`
            return (
            <article class="tone-window" key={translation.tone}>
              <header>
                {showToneLabels ? <span>{toneDisplayName(translation.tone)}</span> : null}
                <div class="copy-control">
                  {speechSupported ? (
                    <button
                      type="button"
                      class="icon-button small"
                      onClick={() => onSpeak(translation.text, speechLang, speechId)}
                      title={
                        speakingId === speechId
                          ? t('translator-stop-reading')
                          : t('translator-listen-to-tone', { tone: toneDisplayName(translation.tone) })
                      }
                      aria-label={
                        speakingId === speechId
                          ? t('translator-stop-reading')
                          : t('translator-listen-to-tone', { tone: toneDisplayName(translation.tone) })
                      }
                    >
                      {speechLoadingId === speechId ? (
                        <LoaderCircle size={18} class="spin" />
                      ) : speakingId === speechId ? (
                        <Square size={18} />
                      ) : (
                        <Volume2 size={18} />
                      )}
                    </button>
                  ) : null}
                  {speechDownloadSupported ? (
                    <button
                      type="button"
                      class="icon-button small"
                      onClick={() => onDownloadSpeech(translation.text, speechId)}
                      title={t('translator-download-audio')}
                      aria-label={t('translator-download-audio')}
                      disabled={speechDownloadingId === speechId}
                    >
                      {speechDownloadingId === speechId ? (
                        <LoaderCircle size={18} class="spin" />
                      ) : (
                        <Download size={18} />
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    class={`icon-button small ${copiedTone === translation.tone ? 'copy-success' : ''}`}
                    onClick={() => onCopyTranslation(translation)}
                    title={t('translator-copy-tone', { tone: toneDisplayName(translation.tone) })}
                    aria-label={t('translator-copy-tone', { tone: toneDisplayName(translation.tone) })}
                  >
                    {copiedTone === translation.tone ? <Check size={18} /> : <Clipboard size={18} />}
                  </button>
                </div>
              </header>
              <div class="tone-body">
                <pre>{translation.text}</pre>
                {translation.pinyin ? (
                  <p class="pinyin">
                    <span>{t('translator-pinyin-label')}</span>
                    {translation.pinyin}
                  </p>
                ) : null}
                {translation.reading && !targetLanguage.includes('Chinese') ? (
                  <p class="reading">
                    <span>{t('translator-pronunciation-label')}</span>
                    {translation.reading}
                  </p>
                ) : null}
              </div>
            </article>
            )
          })}
        </div>
      ) : null}
      {status !== 'loading' && result?.notes.length ? (
        <section class="notes-panel">
          {result.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </section>
      ) : null}
      {hasTranslations ? (
        <div class="tone-actions">
          <button
            type="button"
            class={`secondary-button ${backTranslationStatus === 'loading' ? 'loading' : ''}`}
            onClick={onCheckBackTranslation}
            disabled={!canCheckBackTranslation}
          >
            {backTranslationStatus === 'loading' ? <LoaderCircle size={16} /> : <RefreshCw size={16} />}
            {backTranslationStatus === 'loading' ? t('translator-checking') : t('translator-back-translate')}
          </button>
        </div>
      ) : null}
      {backTranslationStatus === 'loading' ? (
        <span class="loading-line">
          <LoaderCircle size={18} />
          {t('translator-checking-back-translation')}
        </span>
      ) : null}
      {backTranslation ? <BackTranslationPanel backTranslation={backTranslation} /> : null}
      {status !== 'loading' && !hasTranslations ? (
        providerNeedsSetup ? (
          <ProviderSetupGuide onOpenSettings={onOpenSettings} />
        ) : (
          <div class="empty-state">
            <ScrollText size={22} />
            <span>{t('translator-translations-empty')}</span>
          </div>
        )
      ) : null}
    </>
  )
})

function BackTranslationPanel({ backTranslation }: { backTranslation: BackTranslationCheck }) {
  return (
    <section class="back-translation-panel">
      {backTranslation.summary ? <p class="back-translation-summary">{backTranslation.summary}</p> : null}
      {backTranslation.issues.length ? (
        <div class="back-translation-issues">
          {backTranslation.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      ) : null}
      {backTranslation.checks.map((check) => (
        <article class="back-translation-card" key={check.tone}>
          <header>
            <span>{toneDisplayName(check.tone)}</span>
            {check.verdict ? <strong>{check.verdict}</strong> : null}
          </header>
          <pre>{check.text}</pre>
          {check.issues.length ? (
            <div class="back-translation-issues">
              {check.issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  )
}
