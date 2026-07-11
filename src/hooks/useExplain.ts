import { useMemo, useRef, useState } from 'preact/hooks'
import { normalizeBaseUrl } from '../lib/format'
import { localizeNetworkError } from '../lib/network'
import { explainText, explainRuby } from '../lib/explain'
import type { ExplanationResult, ExplanationRubyToken, ProviderSettings, Status } from '../types'

type UseExplainParams = {
  settings: ProviderSettings
  sourceText: string
  nativeLanguage: string
  onDone?: (sourceText: string, result: ExplanationResult) => void
  onRubyTokens?: (sourceText: string, tokens: ExplanationRubyToken[]) => void
}

export function useExplain({ settings, sourceText, nativeLanguage, onDone, onRubyTokens }: UseExplainParams) {
  const [explainStatus, setExplainStatus] = useState<Status>('idle')
  const [explainResult, setExplainResult] = useState<ExplanationResult | null>(null)
  const [explainError, setExplainError] = useState('')
  const [explainRubyStatus, setExplainRubyStatus] = useState<Status>('idle')
  const [explainRubyTokens, setExplainRubyTokens] = useState<ExplanationRubyToken[]>([])

  const explainGeneration = useRef(0)

  const canExplain = useMemo(
    () =>
      Boolean(
        sourceText.trim() &&
          (settings.connection === 'network' ? settings.roomId.trim() : settings.model.trim() && normalizeBaseUrl(settings.baseUrl)),
      ),
    [settings, sourceText],
  )

  function resetExplain(): void {
    explainGeneration.current += 1
    setExplainStatus('idle')
    setExplainResult(null)
    setExplainError('')
    setExplainRubyStatus('idle')
    setExplainRubyTokens([])
  }

  async function handleExplain(): Promise<void> {
    if (!canExplain || explainStatus === 'loading') return

    const generation = ++explainGeneration.current

    setExplainStatus('loading')
    setExplainError('')
    setExplainRubyStatus('loading')
    setExplainRubyTokens([])

    explainRuby({ settings, sourceText })
      .then((nextTokens) => {
        if (explainGeneration.current !== generation) return
        setExplainRubyTokens(nextTokens)
        setExplainRubyStatus('done')
        onRubyTokens?.(sourceText, nextTokens)
      })
      .catch(() => {
        if (explainGeneration.current !== generation) return
        setExplainRubyStatus('error')
      })

    try {
      const nextResult = await explainText({
        settings,
        sourceText,
        nativeLanguage,
      })
      if (explainGeneration.current !== generation) return
      setExplainResult(nextResult)
      setExplainStatus('done')
      onDone?.(sourceText, nextResult)
    } catch (explainError) {
      if (explainGeneration.current !== generation) return
      setExplainError(localizeNetworkError(explainError, 'Explanation failed.'))
      setExplainStatus('error')
    }
  }

  function restoreExplain(result: ExplanationResult): void {
    explainGeneration.current += 1
    setExplainStatus('done')
    setExplainResult(result)
    setExplainError('')
    if (result.rubyTokens.length) {
      setExplainRubyTokens(result.rubyTokens)
      setExplainRubyStatus('done')
    } else {
      setExplainRubyTokens([])
      setExplainRubyStatus('idle')
    }
  }

  return {
    explainStatus,
    explainResult,
    explainError,
    explainRubyStatus,
    explainRubyTokens,
    canExplain,
    resetExplain,
    handleExplain,
    restoreExplain,
  }
}
