import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../../i18n'

export type UseSpeechRecognitionResult = {
  isListening: boolean
  isSupported: boolean
  transcript: string
  lang: string
  setLang: (lang: string) => void
  start: () => void
  stop: () => void
  toggle: () => void
  error: string
  reset: () => void
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

const FATAL_ERROR_CODES = new Set(['not-allowed', 'audio-capture', 'service-not-allowed'])

export function useSpeechRecognition(initialLang: string): UseSpeechRecognitionResult {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
  const isSupported = Boolean(SpeechRecognitionCtor)

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lang, setLang] = useState(initialLang)
  const [error, setError] = useState('')
  const isListeningRef = useRef(false)
  const fatalErrorRef = useRef(false)

  useEffect(() => {
    if (!isListening || !SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang
    isListeningRef.current = true
    fatalErrorRef.current = false
    setError('')

    recognition.onresult = (event) => {
      const { transcript: latest } = event.results[event.results.length - 1][0]
      setTranscript(latest)
    }

    recognition.onerror = (event) => {
      fatalErrorRef.current = FATAL_ERROR_CODES.has(event.error)
      setError(event.error || t('transcribe-error-generic'))
    }

    recognition.onend = () => {
      setTranscript('')
      if (fatalErrorRef.current) {
        isListeningRef.current = false
        setIsListening(false)
        return
      }
      if (isListeningRef.current) recognition.start()
    }

    recognition.start()

    return () => {
      recognition.onend = null
      recognition.stop()
    }
  }, [isListening, lang, SpeechRecognitionCtor])

  const start = useCallback(() => {
    if (!isSupported) return
    setError('')
    setIsListening(true)
  }, [isSupported])

  const stop = useCallback(() => {
    isListeningRef.current = false
    setIsListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (isListening) {
      stop()
      return
    }
    start()
  }, [isListening, start, stop])

  const reset = useCallback(() => {
    setTranscript('')
  }, [])

  return { isListening, isSupported, transcript, lang, setLang, start, stop, toggle, error, reset }
}
