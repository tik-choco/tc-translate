import { useMemo, useState } from 'preact/hooks'
import { normalizeBaseUrl, writeClipboard } from '../lib/format'
import { localizeNetworkError } from '../lib/network'
import { proofreadText } from '../lib/proofread'
import type { ProofreadResult, ProviderSettings, Status } from '../types'

type UseProofreadParams = {
  settings: ProviderSettings
  sourceText: string
  nativeLanguage: string
  onDone?: (sourceText: string, result: ProofreadResult) => void
}

export function useProofread({ settings, sourceText, nativeLanguage, onDone }: UseProofreadParams) {
  const [proofreadStatus, setProofreadStatus] = useState<Status>('idle')
  const [proofreadResult, setProofreadResult] = useState<ProofreadResult | null>(null)
  const [proofreadError, setProofreadError] = useState('')
  const [copiedProofread, setCopiedProofread] = useState(false)

  const canProofread = useMemo(
    () =>
      Boolean(
        sourceText.trim() &&
          (settings.connection === 'network' ? settings.roomId.trim() : settings.model.trim() && normalizeBaseUrl(settings.baseUrl)),
      ),
    [settings, sourceText],
  )

  function resetProofread(): void {
    setProofreadStatus('idle')
    setProofreadResult(null)
    setProofreadError('')
    setCopiedProofread(false)
  }

  async function handleProofread(): Promise<void> {
    if (!canProofread || proofreadStatus === 'loading') return

    setProofreadStatus('loading')
    setProofreadError('')
    setCopiedProofread(false)

    try {
      const nextResult = await proofreadText({
        settings,
        sourceText,
        nativeLanguage,
      })
      setProofreadResult(nextResult)
      setProofreadStatus('done')
      onDone?.(sourceText, nextResult)
    } catch (proofreadError) {
      setProofreadError(localizeNetworkError(proofreadError, 'Proofread failed.'))
      setProofreadStatus('error')
    }
  }

  function restoreProofread(result: ProofreadResult): void {
    setProofreadResult(result)
    setProofreadStatus('done')
    setProofreadError('')
    setCopiedProofread(false)
  }

  async function copyProofread(): Promise<void> {
    if (!proofreadResult?.correctedText) return

    try {
      await writeClipboard(proofreadResult.correctedText)
      setCopiedProofread(true)
      window.setTimeout(() => setCopiedProofread(false), 1400)
    } catch (copyError) {
      setProofreadError(copyError instanceof Error ? copyError.message : 'Copy failed.')
    }
  }

  return {
    proofreadStatus,
    proofreadResult,
    proofreadError,
    copiedProofread,
    canProofread,
    resetProofread,
    handleProofread,
    copyProofread,
    restoreProofread,
  }
}
