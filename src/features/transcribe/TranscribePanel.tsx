import { Mic, MicOff } from 'lucide-preact'
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../../i18n'
import languages from './languages.json'
import './transcribe.css'
import { useSpeechRecognition } from './useSpeechRecognition'

export function TranscribePanel(): JSX.Element {
  const speech = useSpeechRecognition('ja')
  const [logText, setLogText] = useState('')
  const [keepLog, setKeepLog] = useState(true)
  const prevTranscriptRef = useRef('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

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
    </div>
  )
}
