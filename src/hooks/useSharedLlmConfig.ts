import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { migrateLegacyLocalSettings } from '../lib/migrateLlmConfig'
import { MODEL_CACHE_EVENT } from '../lib/providerModels'
import { emptyLlmConfig, loadLlmConfig, saveLlmConfig, subscribeLlmConfig, type SharedLlmConfigV1 } from '../lib/llmConfig'

let migrated = false

function loadInitialConfig(): SharedLlmConfigV1 {
  // Runs once per page load: migrates tc-translate's legacy local settings
  // into the shared config (idempotent - see migrateLegacyLocalSettings) so
  // the very first read below already reflects them.
  if (!migrated) {
    migrated = true
    migrateLegacyLocalSettings()
  }
  return loadLlmConfig() ?? emptyLlmConfig()
}

/**
 * Owns tc-translate's copy of the shared `tc-shared-llm-config-v1` config:
 * loads it (running the one-time legacy migration first), subscribes to
 * cross-tab/cross-app updates (the `storage` event only fires for tabs other
 * than the writer, so same-tab writes go through `save` below instead), and
 * exposes a `save` helper that mutates+persists a clone and updates local
 * state immediately.
 */
export function useSharedLlmConfig() {
  const [config, setConfig] = useState<SharedLlmConfigV1>(() => loadInitialConfig())
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    const update = (next: SharedLlmConfigV1 | null) => {
      configRef.current = next ?? emptyLlmConfig()
      setConfig(configRef.current)
    }
    const stop = subscribeLlmConfig(update)
    const onCache = () => update(loadLlmConfig())
    window.addEventListener(MODEL_CACHE_EVENT, onCache)
    return () => { stop(); window.removeEventListener(MODEL_CACHE_EVENT, onCache) }
  }, [])

  const save = useCallback((mutate: (config: SharedLlmConfigV1) => void): SharedLlmConfigV1 => {
    const next = structuredClone(configRef.current)
    mutate(next)
    saveLlmConfig(next)
    configRef.current = next
    setConfig(next)
    return next
  }, [])

  return useMemo(() => ({ config, save }), [config, save])
}

export type SharedLlmConfigState = ReturnType<typeof useSharedLlmConfig>
