import { ArrowLeftRight, Check, Clipboard, LoaderCircle, Play, RefreshCw, ScrollText, Square, Volume2 } from 'lucide-preact'
import { memo } from 'preact/compat'
import { t } from '../i18n'
import { speechCodeForLanguage, toneDisplayName } from '../lib/language'
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
  targetLanguage: string
  copiedTone: string
  onCopyTranslation: (translation: TranslationVariant) => void
  missingToneOptions: string[]
  toneStatus: Status
  canGenerateTones: boolean
  onGenerateTones: () => void
  backTranslationStatus: Status
  canCheckBackTranslation: boolean
  onCheckBackTranslation: () => void
  backTranslation: BackTranslationCheck | null
  speechSupported: boolean
  speakingId: string | null
  speechLoadingId: string | null
  onSpeak: (text: string, lang: string | undefined, id: string) => void
  providerNeedsSetup: boolean
  onOpenSettings: () => void
}

export const TranslationOutput = memo(function TranslationOutput({
  status,
  selectedHistory,
  result,
  targetLanguage,
  copiedTone,
  onCopyTranslation,
  missingToneOptions,
  toneStatus,
  canGenerateTones,
  onGenerateTones,
  backTranslationStatus,
  canCheckBackTranslation,
  onCheckBackTranslation,
  backTranslation,
  speechSupported,
  speakingId,
  speechLoadingId,
  onSpeak,
  providerNeedsSetup,
  onOpenSettings,
}: TranslationOutputProps) {
  const hasTranslations = Boolean(result?.translations.length)
  const speechLang = speechCodeForLanguage(result?.translatedLanguage ?? targetLanguage)

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
      {status === 'loading' ? (
        <span class="loading-line">
          <LoaderCircle size={18} />
          {t('translator-translating')}
        </span>
      ) : hasTranslations ? (
        <div class="bubble-list">
          {result?.translations.map((translation, index) => {
            const speechId = `translation-${translation.tone}`
            return (
            <article class="tone-window" key={translation.tone}>
              <header>
                <span>{toneDisplayName(translation.tone)}</span>
                <div class="copy-control">
                  <kbd>{t('translator-ctrl-shortcut', { n: index + 1 })}</kbd>
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
          {missingToneOptions.length ? (
            <button
              type="button"
              class={`secondary-button ${toneStatus === 'loading' ? 'loading' : ''}`}
              onClick={onGenerateTones}
              disabled={!canGenerateTones}
            >
              {toneStatus === 'loading' ? <LoaderCircle size={16} /> : <Play size={16} />}
              {toneStatus === 'loading' ? t('translator-generating-tones') : t('translator-generate-tones')}
            </button>
          ) : null}
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
