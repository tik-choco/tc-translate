import { useEffect } from 'preact/hooks'
import { ensurePreset, ensureProvider, normalizeBaseUrl } from '../lib/llmConfig'
import { deletePreset, deleteProvider } from '../lib/llmConfigEdit'
import { NETWORK_PROVIDER_LABEL, networkProviderBaseUrl } from '../lib/networkModels'
import type { ConsumerStatus } from '../lib/network'
import type { ProviderSettings } from '../types'
import type { SharedLlmConfigState } from './useSharedLlmConfig'

/**
 * Mirrors the model names advertised by LLM Network room providers (their
 * preset labels, falling back to model ids - see advertisedModelName in
 * lib/networkModels.ts) into the shared llm config, so they show up as
 * ordinary presets - under a `mist-network://<roomId>` pseudo-provider - that
 * the user can pick as their default/vision/TTS/STT preset just like a
 * preset backed by a real HTTP provider (see resolvePreset in
 * lib/llmConfig.ts, which doesn't distinguish the two).
 *
 * A mirror, not an append-only import: while connected, presets under the
 * room's pseudo-provider whose model is no longer advertised are pruned, so
 * a provider unchecking a shared model makes its card disappear here as soon
 * as the re-broadcast provider_hello lands (see the rejoin pulse in
 * useNetworkProvider). Pruning is scoped strictly to the current room's
 * pseudo-provider - entries this sync itself created - so the shared config's
 * append-only convention for OTHER apps' providers/presets still holds. A
 * disconnect ("searching"/error) is NOT a prune trigger: offline isn't the
 * same as un-shared, so imported cards survive reconnects.
 *
 * Only runs while actively consuming via the network transport
 * (`settings.connection === 'network'`) and connected to a room
 * (`ConsumerStatus`, see lib/network.ts). Additions go through the
 * append-only `ensureProvider`/`ensurePreset` helpers; removals through
 * `deletePreset` (which re-points defaultPresetId if needed) and, once the
 * room advertises nothing at all, `deleteProvider` for the then-empty
 * pseudo-provider row. Writes are skipped entirely when the mirrored set
 * already matches, so reconnects/re-renders don't thrash localStorage or
 * retrigger the cross-tab `storage` event on every tick.
 */
export function useNetworkModelSync(
  settings: ProviderSettings,
  consumerStatus: ConsumerStatus,
  llmConfigState: SharedLlmConfigState,
): void {
  const connected = consumerStatus.phase === 'connected'
  const models = connected ? consumerStatus.models : undefined
  // Deduped/sorted/joined into a single string so the effect below only
  // reruns when the actual model set changes, not on every re-render that
  // produces a new (but equivalent) models array reference.
  const modelsKey = models && models.length ? [...new Set(models)].sort().join('\n') : ''

  useEffect(() => {
    if (settings.connection !== 'network' || !connected) return

    const baseUrl = networkProviderBaseUrl(settings.roomId)
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
    const modelList = modelsKey ? modelsKey.split('\n') : []
    const modelSet = new Set(modelList)

    // No-op check mirroring the save below against the current config, so
    // llmConfigState.save() - which re-renders every consumer of the shared
    // config - is only called when there's actually something to add or
    // prune. The dedup keys match ensureProvider's/ensurePreset's own
    // (baseUrl+apiKey for the provider; providerId+model+temperature+
    // reasoningEffort for each preset).
    const config = llmConfigState.config
    const provider = config.providers.find((p) => p.baseUrl === normalizedBaseUrl && p.apiKey === '')
    const inSync =
      provider === undefined
        ? modelList.length === 0
        : modelList.length === 0
          ? false // provider row lingers although nothing is advertised any more
          : config.presets.every((preset) => preset.providerId !== provider.id || modelSet.has(preset.model)) &&
            modelList.every((model) =>
              config.presets.some(
                (preset) =>
                  preset.providerId === provider.id &&
                  preset.model === model &&
                  preset.temperature === undefined &&
                  preset.reasoningEffort === undefined,
              ),
            )
    if (inSync) return

    llmConfigState.save((next) => {
      if (modelList.length === 0) {
        // Connected, but the room advertises nothing (everything was
        // un-shared): drop the imported presets and the now-empty
        // pseudo-provider row itself.
        const staleProvider = next.providers.find((p) => p.baseUrl === normalizedBaseUrl && p.apiKey === '')
        if (!staleProvider) return
        for (const preset of next.presets.filter((p) => p.providerId === staleProvider.id)) {
          deletePreset(next, preset.id)
        }
        deleteProvider(next, staleProvider.id)
        return
      }

      const providerId = ensureProvider(next, { label: NETWORK_PROVIDER_LABEL, baseUrl, apiKey: '' })
      for (const model of modelList) {
        ensurePreset(next, { providerId, model, label: model })
      }
      for (const preset of next.presets.filter((p) => p.providerId === providerId && !modelSet.has(p.model))) {
        deletePreset(next, preset.id)
      }
    })
  }, [settings.connection, settings.roomId, connected, modelsKey, llmConfigState.config, llmConfigState.save])
}
