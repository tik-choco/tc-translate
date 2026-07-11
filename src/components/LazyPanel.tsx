import type { ComponentType, FunctionComponent } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'

type LazyPanelProps = {
  active: boolean
  load: () => Promise<ComponentType>
}

export const LazyPanel = memo(function LazyPanel({ active, load }: LazyPanelProps) {
  const [Comp, setComp] = useState<ComponentType | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!active || Comp) return
    let cancelled = false
    setError(false)
    load()
      .then((loaded) => {
        if (!cancelled) setComp(() => memo(loaded as FunctionComponent))
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [active, Comp, load, attempt])

  if (!active && !Comp) return null

  if (error) {
    return (
      <div class="tab-panel-loading">
        <p>Failed to load this tab.</p>
        <button type="button" class="tab-panel-retry" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </button>
      </div>
    )
  }

  if (!Comp) return <div class="tab-panel-loading">Loading…</div>

  return <Comp />
})
