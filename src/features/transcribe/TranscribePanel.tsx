import { LoaderCircle, Mic, MicOff, TriangleAlert, X } from 'lucide-preact'
import type { JSX } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { languageOptions } from '../../constants'
import { t } from '../../i18n'
import { appendTranscript } from '../../lib/format'
import { languageOptionLabel } from '../../lib/language'
import { ProviderSetupGuide } from '../../components/ProviderSetupGuide'
import type { SharedLlmConfigV1 } from '../../lib/llmConfig'
import type { ProviderSettings, SttSettings } from '../../types'
import languages from './languages.json'
import './transcribe.css'
import { useSimultaneousTranslation } from './useSimultaneousTranslation'
import { useSpeechRecognition } from './useSpeechRecognition'
import { useSttSegments } from './useSttSegments'

type TranscribePanelProps = {
  settings: ProviderSettings
  sttSettings: SttSettings
  llmConfig: SharedLlmConfigV1
  onOpenSettings: () => void
}

export function TranscribePanel({ settings, sttSettings, llmConfig, onOpenSettings }: TranscribePanelProps): JSX.Element {
  const simul = useSimultaneousTranslation(settings)

  const handleFinalResult = useCallback((text: string) => void simul.submitSegment(text), [simul.submitSegment])
  const speech = useSpeechRecognition('ja', handleFinalResult)
  const [logText, setLogText] = useState('')
  const [keepLog, setKeepLog] = useState(true)

  // Configured STT (API/Network) takes priority via the batch-segment path;
  // the browser's live recognition is the fallback when none is configured.
  const handleSttSegment = useCallback(
    (text: string) => {
      void simul.submitSegment(text)
      setLogText((current) => (keepLog ? appendTranscript(current, text) : text))
    },
    [simul.submitSegment, keepLog],
  )
  const stt = useSttSegments({
    sttSettings,
    llmConfig,
    roomId: settings.roomId,
    speechLang: speech.lang,
    onSegment: handleSttSegment,
  })
  const usingApiStt = stt.configured
  const isListening = usingApiStt ? stt.isListening : speech.isListening
  const toggleListening = usingApiStt ? stt.toggle : speech.toggle
  const listenError = usingApiStt ? stt.error : speech.error
  const prevTranscriptRef = useRef('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const simulBottomRef = useRef<HTMLDivElement | null>(null)

  const availableLanguages = useMemo(
    () => languageOptions.filter((language) => !simul.targetLanguages.includes(language)),
    [simul.targetLanguages],
  )

  useEffect(() => {
    if (keepLog && prevTranscriptRef.current && speech.transcript.length < prevTranscriptRef.current.length) {
      setLogText((current) => appendTranscript(current, prevTranscriptRef.current))
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

  if (!speech.isSupported && !stt.configured) {
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
          class={`transcribe-toggle ${isListening ? 'active' : ''}`}
          onClick={toggleListening}
          aria-pressed={isListening}
          aria-label={isListening ? t('transcribe-stop-aria-label') : t('transcribe-start-aria-label')}
        >
          {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          {isListening ? t('transcribe-stop-button') : t('transcribe-start-button')}
        </button>
        {usingApiStt && stt.isTranscribing ? (
          <span class="transcribe-simul-result-pending" aria-label={t('transcribe-simul-pending-aria-label')}>
            <LoaderCircle size={16} />
          </span>
        ) : null}
      </div>

      <p class="transcribe-stt-mode">
        {!usingApiStt
          ? t('transcribe-stt-mode-browser')
          : stt.mode === 'realtime'
            ? t('transcribe-stt-mode-realtime')
            : stt.mode === 'batch'
              ? t('transcribe-stt-mode-batch')
              : t('transcribe-stt-mode-api')}
      </p>

      {listenError ? <p class="transcribe-error">{listenError}</p> : null}

      <div class="transcribe-transcript">
        <span class="transcribe-log">{logText}</span>
        <span class="transcribe-current">{usingApiStt ? stt.liveText : speech.transcript}</span>
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
