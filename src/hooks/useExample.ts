import { useMemo, useRef, useState } from 'preact/hooks'
import { normalizeBaseUrl } from '../lib/format'
import { generateExamples } from '../lib/example'
import { localizeNetworkError } from '../lib/network'
import type { ExampleResult, ProviderSettings, Status } from '../types'

type UseExampleParams = {
  settings: ProviderSettings
  sourceText: string
  nativeLanguage: string
  onDone?: (sourceText: string, result: ExampleResult) => void
}

export function useExample({ settings, sourceText, nativeLanguage, onDone }: UseExampleParams) {
  const [exampleStatus, setExampleStatus] = useState<Status>('idle')
  const [exampleResult, setExampleResult] = useState<ExampleResult | null>(null)
  const [exampleError, setExampleError] = useState('')

  const exampleGeneration = useRef(0)

  const canExample = useMemo(
    () =>
      Boolean(
        sourceText.trim() &&
          (settings.connection === 'network' ? settings.roomId.trim() : settings.model.trim() && normalizeBaseUrl(settings.baseUrl)),
      ),
    [settings, sourceText],
  )

  function resetExample(): void {
    exampleGeneration.current += 1
    setExampleStatus('idle')
    setExampleResult(null)
    setExampleError('')
  }

  async function handleExample(): Promise<void> {
    if (!canExample || exampleStatus === 'loading') return

    const generation = ++exampleGeneration.current

    setExampleStatus('loading')
    setExampleError('')

    try {
      const nextResult = await generateExamples({
        settings,
        sourceText,
        nativeLanguage,
      })
      if (exampleGeneration.current !== generation) return
      setExampleResult(nextResult)
      setExampleStatus('done')
      onDone?.(sourceText, nextResult)
    } catch (exampleError) {
      if (exampleGeneration.current !== generation) return
      setExampleError(localizeNetworkError(exampleError, 'Example generation failed.'))
      setExampleStatus('error')
    }
  }

  function restoreExample(result: ExampleResult): void {
    exampleGeneration.current += 1
    setExampleStatus('done')
    setExampleResult(result)
    setExampleError('')
  }

  return {
    exampleStatus,
    exampleResult,
    exampleError,
    canExample,
    resetExample,
    handleExample,
    restoreExample,
  }
}
