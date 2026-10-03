import { t } from '../i18n'
import type { LlmProviderV1 } from '../lib/llmConfig'
import { modelFetchStatus } from '../lib/providerModels'
import { useModelFetchStatus } from '../hooks/useModelFetchStatus'

export function ModelFetchState({ provider }: { provider: LlmProviderV1 }) {
  useModelFetchStatus()
  const status = modelFetchStatus(provider)
  return <span class={`provider-count ${status?.phase === 'error' ? 'provider-fetch-error' : ''}`} role="status" data-fetch-state={provider.enabled === false ? 'disabled' : status?.phase ?? (provider.modelsFetchedAt ? 'ok' : 'cache')} title={status?.error}>
    {provider.enabled === false ? t('models-disabled') : status?.phase === 'fetching' ? t('models-fetching') : status?.phase === 'error' ? t('models-fetch-error') : provider.modelsFetchedAt ? t('models-ok', { count: provider.models?.length ?? 0 }) : t('models-count', { count: provider.models?.length ?? 0 })}
  </span>
}
