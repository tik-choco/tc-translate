// Self-heal helper for hooks/useNetworkModelSync.ts's `mist-network://`
// mirror: collapses accidental duplicate pseudo-provider rows/presets for a
// room back into one canonical set. NOT part of the vendored llmConfig.ts /
// networkModels.ts contract files (those stay byte-for-byte identical to
// their tc-lingo/mistai twins - see their own header comments) - this is a
// local addition on top of them.
import { normalizeBaseUrl } from './llmConfig'
import { networkProviderBaseUrl } from './networkModels'
import type { ModelPresetV1, SharedLlmConfigV1 } from './llmConfig'

export type NetworkMirrorConsolidation = {
  /** Whether `config` was mutated - callers should persist (and notify) only when true. */
  changed: boolean
  /**
   * Maps a removed duplicate preset's id to the id of the surviving preset
   * it was merged into. `config.defaultPresetId` is already repointed
   * in-place when it named a removed id; a caller-owned reference living
   * outside `config` (e.g. tc-translate's `LocalProviderSettings.visionPresetId`/
   * `networkProviderPresetIds`) is not - see `lib/storage.ts`'s
   * `remapPresetIdReferences`.
   */
  presetIdRemap: Map<string, string>
}

/**
 * Self-heals `config`'s `mist-network://<roomId>` mirror for one room:
 * collapses any duplicate pseudo-provider rows (same normalized baseUrl,
 * apiKey `""`) into the first one (oldest, since `providers` is an
 * append-only array), and any duplicate presets found under them - same
 * advertised model name (trimmed) + temperature + reasoningEffort - into a
 * single survivor. Within such a duplicate group, a preset still wearing the
 * generic label `ensurePreset`/useNetworkModelSync.ts stamps on every
 * freshly (re)created preset (its trimmed model id, verbatim) loses to one
 * carrying a user-typed label, so a race that merely duplicated the row
 * never gets to silently discard a rename the user made to just one of the
 * copies; only when every candidate in the group is equally generic (or
 * equally customized) does it fall back to array order (oldest first), as
 * before. Mutates `config` in place.
 *
 * Duplicates of this shape are never supposed to happen -
 * `ensureProvider`/`ensurePreset` (lib/llmConfig.ts) already dedup exactly
 * (baseUrl+apiKey; providerId+model+temperature+reasoningEffort) and are
 * idempotent for a single writer - but `tc-shared-llm-config-v1` is co-owned
 * with no locking (last-write-wins by `updatedAt`; see llmConfig.ts's header
 * comment): two same-origin app instances (two tabs, or two apps) both
 * mirroring the same room can each `loadLlmConfig()`/read `llmConfigState.config`
 * before the other's `saveLlmConfig()` lands and each create their own row
 * for what should be one entry. The trimmed-model comparison additionally
 * absorbs a provider that re-advertises the "same" model with incidental
 * whitespace differences across reconnects, which would otherwise dedup-key
 * as a distinct model and never get pruned by the exact-match check in
 * useNetworkModelSync.ts.
 *
 * This is the one sanctioned exception to the shared config's "append-only,
 * never touch another app's entries" convention (see llmConfig.ts's
 * merge-policy comment): it only ever touches entries a mist-network://
 * mirror for THIS room would itself have created, collapsing them back to
 * the shape `ensureProvider`/`ensurePreset` would have produced with no
 * race - it never removes a real HTTP provider/preset another app added, and
 * never touches a different room's pseudo-provider.
 *
 * Callers should run this on every mirror-sync tick (each connect/reconnect,
 * not just once behind a migration flag), so duplication from any cause -
 * including any that predates this function - gets cleaned up the next time
 * the room is actually joined.
 */
export function consolidateNetworkMirror(config: SharedLlmConfigV1, roomId: string): NetworkMirrorConsolidation {
  const baseUrl = normalizeBaseUrl(networkProviderBaseUrl(roomId))
  const matchingProviders = config.providers.filter((p) => p.baseUrl === baseUrl && p.apiKey === '')
  const presetIdRemap = new Map<string, string>()
  if (matchingProviders.length === 0) return { changed: false, presetIdRemap }

  const survivor = matchingProviders[0]
  const matchingProviderIds = new Set(matchingProviders.map((p) => p.id))
  const extraProviderIds = new Set(matchingProviders.slice(1).map((p) => p.id))

  const keyOf = (p: ModelPresetV1) => `${p.model.trim()} ${p.temperature ?? ''} ${p.reasoningEffort ?? ''}`
  /**
   * True when `label` looks like something the user actually typed, rather
   * than the generic label every freshly (re)created preset gets stamped
   * with by default (its own trimmed model id, verbatim - see
   * `ensurePreset` in lib/llmConfig.ts and useNetworkModelSync.ts).
   */
  const isCustomLabel = (p: ModelPresetV1) => {
    const label = p.label.trim()
    return label !== '' && label !== p.model.trim()
  }
  const groupsByKey = new Map<string, ModelPresetV1[]>()

  for (const preset of config.presets) {
    if (!matchingProviderIds.has(preset.providerId)) continue
    const key = keyOf(preset)
    const group = groupsByKey.get(key)
    if (group) group.push(preset)
    else groupsByKey.set(key, [preset])
  }

  for (const group of groupsByKey.values()) {
    // Prefer a custom-labeled preset as the survivor (see isCustomLabel);
    // ties (including "every candidate is generic" and "every candidate is
    // customized") fall back to array order (oldest first).
    const chosen = group.find(isCustomLabel) ?? group[0]
    // Adopt the chosen preset into the survivor provider row - keeps its own
    // id, so any external reference to it (defaultPresetId, visionPresetId,
    // a networkProviderPresetIds entry) stays valid without needing a remap
    // entry.
    if (chosen.providerId !== survivor.id) chosen.providerId = survivor.id
    for (const preset of group) {
      if (preset !== chosen) presetIdRemap.set(preset.id, chosen.id)
    }
  }

  if (extraProviderIds.size === 0 && presetIdRemap.size === 0) return { changed: false, presetIdRemap }

  if (presetIdRemap.size > 0) config.presets = config.presets.filter((p) => !presetIdRemap.has(p.id))
  if (extraProviderIds.size > 0) config.providers = config.providers.filter((p) => !extraProviderIds.has(p.id))

  const remappedDefault = presetIdRemap.get(config.defaultPresetId)
  if (remappedDefault) config.defaultPresetId = remappedDefault

  return { changed: true, presetIdRemap }
}
