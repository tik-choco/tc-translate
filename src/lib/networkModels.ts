// Helpers for representing LLM Network–discovered models in the shared llm
// config: they live under a pseudo-provider whose baseUrl uses the
// `mist-network://` scheme (one per Room ID), so other tik-choco apps see a
// syntactically valid provider entry while this app can recognize and
// special-case it (no HTTP model fetch, network transport routing).
export const NETWORK_PROVIDER_LABEL = 'AI Network'
export const NETWORK_PROVIDER_URL_PREFIX = 'mist-network://'

export function networkProviderBaseUrl(roomId: string): string {
  return `${NETWORK_PROVIDER_URL_PREFIX}${roomId.trim() || 'default'}`
}

export function isNetworkProviderBaseUrl(baseUrl: string): boolean {
  return baseUrl.trim().startsWith(NETWORK_PROVIDER_URL_PREFIX)
}

export function roomIdFromBaseUrl(baseUrl: string): string {
  return isNetworkProviderBaseUrl(baseUrl) ? baseUrl.trim().slice(NETWORK_PROVIDER_URL_PREFIX.length) : ''
}

/** Sentinel voice-config model meaning "let the room's provider use its own configured TTS/STT model". Stored in the shared config's tts/stt model field alongside a mist-network pseudo-provider id; stripped from outgoing requests (an omitted wire model → provider's own default). */
export const NETWORK_VOICE_AUTO_MODEL = 'network-auto'

/** Maps a configured voice model to the wire request param: the auto sentinel becomes undefined (omit), anything else passes through (empty → undefined too). */
export function networkVoiceModelParam(model: string): string | undefined {
  const trimmed = model.trim()
  return !trimmed || trimmed === NETWORK_VOICE_AUTO_MODEL ? undefined : trimmed
}
