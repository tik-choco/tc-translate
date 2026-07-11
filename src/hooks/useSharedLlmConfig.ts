import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { migrateLegacyLocalSettings } from '../lib/migrateLlmConfig'
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

  useEffect(() => subscribeLlmConfig((next) => setConfig(next ?? emptyLlmConfig())), [])

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
