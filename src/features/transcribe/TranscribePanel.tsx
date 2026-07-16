import { LoaderCircle, Mic, MicOff, TriangleAlert, X } from 'lucide-preact'
import type { JSX } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { languageOptions } from '../../constants'
import { t } from '../../i18n'
import { languageOptionLabel } from '../../lib/language'
import { ProviderSetupGuide } from '../../components/ProviderSetupGuide'
import type { ProviderSettings } from '../../types'
import languages from './languages.json'
import './transcribe.css'
import { useSimultaneousTranslation } from './useSimultaneousTranslation'
import { useSpeechRecognition } from './useSpeechRecognition'

type TranscribePanelProps = {
  settings: ProviderSettings
  onOpenSettings: () => void
}

export function TranscribePanel({ settings, onOpenSettings }: TranscribePanelProps): JSX.Element {
  const simul = useSimultaneousTranslation(settings)

  const handleFinalResult = useCallback((text: string) => void simul.submitSegment(text), [simul.submitSegment])
  const speech = useSpeechRecognition('ja', handleFinalResult)
  const [logText, setLogText] = useState('')
  const [keepLog, setKeepLog] = useState(true)
  const prevTranscriptRef = useRef('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const simulBottomRef = useRef<HTMLDivElement | null>(null)

  const availableLanguages = useMemo(
    () => languageOptions.filter((language) => !simul.targetLanguages.includes(language)),
    [simul.targetLanguages],
  )

  useEffect(() => {
    if (keepLog && prevTranscriptRef.current && speech.transcript.length < prevTranscriptRef.current.length) {
      setLogText((current) => current + prevTranscriptRef.current + '\n')
    }
    prevTranscriptRef.current = speech.transcript
  }, [speech.transcript, keepLog])

  useEffect(() => {
    if (!keepLog) setLogText('')
  }, [keepLog])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [speech.transcript, logText])

  useEffect(() => {
    if (simul.enabled) simulBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [simul.entries, simul.enabled])

  if (!speech.isSupported) {
    return (
      <div class="transcribe-panel">
        <p class="transcribe-unsupported">{t('transcribe-unsupported')}</p>
      </div>
    )
  }

  return (
    <div class="transcribe-panel">
      <div class="transcribe-toolbar">
        <select
          class="transcribe-select"
          aria-label={t('transcribe-select-aria-label')}
          value={speech.lang}
          onChange={(event) => speech.setLang(event.currentTarget.value)}
        >
          {languages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.label}
            </option>
          ))}
        </select>

        <label class="transcribe-keep-log">
          <input
            type="checkbox"
            checked={keepLog}
            onChange={(event) => setKeepLog(event.currentTarget.checked)}
          />
          {t('transcribe-keep-log')}
        </label>

        <label class="transcribe-keep-log">
          <input
            type="checkbox"
            checked={simul.enabled}
            onChange={(event) => simul.setEnabled(event.currentTarget.checked)}
          />
          {t('transcribe-simul-toggle')}
        </label>

        <button
          type="button"
          class={`transcribe-toggle ${speech.isListening ? 'active' : ''}`}
          onClick={speech.toggle}
          aria-pressed={speech.isListening}
          aria-label={speech.isListening ? t('transcribe-stop-aria-label') : t('transcribe-start-aria-label')}
        >
          {speech.isListening ? <MicOff size={18} /> : <Mic size={18} />}
          {speech.isListening ? t('transcribe-stop-button') : t('transcribe-start-button')}
        </button>
      </div>

      {speech.error ? <p class="transcribe-error">{speech.error}</p> : null}

      <div class="transcribe-transcript">
        <span class="transcribe-log">{logText}</span>
        <span class="transcribe-current">{speech.transcript}</span>
        <div ref={bottomRef} />
      </div>

      {simul.enabled ? (
        <div class="transcribe-simul">
          <div class="transcribe-simul-languages">
            <span class="transcribe-simul-languages-label">{t('transcribe-simul-languages-label')}</span>
            {simul.targetLanguages.map((language) => (
              <span class="transcribe-simul-chip" key={language}>
                {languageOptionLabel(language)}
                <button
                  type="button"
                  class="transcribe-simul-chip-remove"
                  onClick={() => simul.removeTargetLanguage(language)}
                  aria-label={t('transcribe-simul-remove-aria-label', { language: languageOptionLabel(language) })}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {simul.canAddLanguage ? (
              <select
                class="transcribe-simul-add"
                aria-label={t('transcribe-simul-add-aria-label')}
                value=""
                onChange={(event) => {
                  const value = event.currentTarget.value
                  if (value) simul.addTargetLanguage(value)
                  event.currentTarget.value = ''
                }}
              >
                <option value="" disabled>
                  {t('transcribe-simul-add-placeholder')}
                </option>
                {availableLanguages.map((language) => (
                  <option key={language} value={language}>
                    {languageOptionLabel(language)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {simul.providerNeedsSetup ? (
            <ProviderSetupGuide onOpenSettings={onOpenSettings} />
          ) : (
            <div class="transcribe-simul-panel">
              {simul.entries.length === 0 ? (
                <p class="transcribe-simul-empty">
                  {simul.targetLanguages.length === 0 ? t('transcribe-simul-no-languages') : t('transcribe-simul-empty')}
                </p>
              ) : (
                simul.entries.map((entry) => (
                  <div class="transcribe-simul-entry" key={entry.id}>
                    <p class="transcribe-simul-original">{entry.original}</p>
                    <div class="transcribe-simul-results">
                      {entry.results
                        .filter((result) => result.status !== 'skipped')
                        .map((result) => (
                          <div class="transcribe-simul-result" key={result.language}>
                            <span class="transcribe-simul-result-lang">{languageOptionLabel(result.language)}</span>
                            {result.status === 'pending' ? (
                              <span class="transcribe-simul-result-pending" aria-label={t('transcribe-simul-pending-aria-label')}>
                                <LoaderCircle size={14} />
                              </span>
                            ) : result.status === 'error' ? (
                              <span class="transcribe-simul-result-error">
                                <TriangleAlert size={14} />
                                {result.error || t('transcribe-simul-error')}
                              </span>
                            ) : (
                              <span class="transcribe-simul-result-text">{result.text}</span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
              <div ref={simulBottomRef} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
