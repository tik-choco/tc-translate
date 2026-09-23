import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { isAbortError } from '../../lib/abort'
import type { ProviderSettings, Status } from '../../types'
import { generateFurigana } from './furigana'
import type { RubyToken } from './pinyinZhuyin'

const CACHE_LIMIT = 50
// Session-wide, keyed by the exact Japanese text: flipping the input back to
// something already annotated shows its furigana again without another call.
const furiganaCache = new Map<string, RubyToken[]>()

function remember(text: string, tokens: RubyToken[]): void {
  furiganaCache.delete(text)
  furiganaCache.set(text, tokens)
  if (furiganaCache.size > CACHE_LIMIT) {
    const oldest = furiganaCache.keys().next().value
    if (oldest !== undefined) furiganaCache.delete(oldest)
  }
}

export function useFurigana(settings: ProviderSettings, text: string) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  // Bumped when a request finishes so the cache lookup below re-renders.
  const [, setVersion] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  // A new text invalidates whatever is in flight for the old one.
  useEffect(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStatus('idle')
    setError('')
  }, [text])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const generate = useCallback(async () => {
    if (!text.trim()) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setStatus('loading')
    setError('')
    try {
      const tokens = await generateFurigana({ settings, text, signal: controller.signal })
      if (controller.signal.aborted) return
      remember(text, tokens)
      setVersion((v) => v + 1)
      setStatus('done')
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [settings, text])

  return { tokens: furiganaCache.get(text) ?? null, status, error, generate }
}
