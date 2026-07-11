import { useConsumerConnection } from '@tik-choco/mistai/preact'
import { networkClient } from '../lib/network'
import type { ProviderSettings } from '../types'

/**
 * Eagerly (re)connects the LLM Network consumer session whenever "network
 * consumer" mode is enabled and a Room ID is present, instead of waiting for
 * `requestNetworkChat` to lazily join at translate time. Reconnects when the
 * Room ID changes and disconnects when the mode is turned off.
 *
 * `requestNetworkChat` reuses whatever session this hook already established
 * (ConsumerClient keys the session by roomId), so translation doesn't pay the
 * join/search cost again.
 */
export function useNetworkConsumerConnection(settings: ProviderSettings): void {
  useConsumerConnection(networkClient, {
    enabled: settings.connection === 'network',
    roomId: settings.roomId,
  })
}
