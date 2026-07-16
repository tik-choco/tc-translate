import { Trash2 } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useDraftField } from '../hooks/useDraftField'
import { t } from '../i18n'
import type { LlmProviderV1 } from '../lib/llmConfig'

type LlmProviderCardProps = {
  provider: LlmProviderV1
  onUpdate: (id: string, patch: Partial<Omit<LlmProviderV1, 'id'>>) => void
  onDelete: (id: string) => void
}

// One connection (base URL / API key) in the Settings "Connections" list -
// see SettingsModal.tsx's API tab. Mirrors tc-town's SettingsView provider
// card: everything here lives in the shared `tc-shared-llm-config-v1` key,
// so edits are visible to every tik-choco app on the same origin.
export const LlmProviderCard = memo(function LlmProviderCard({ provider, onUpdate, onDelete }: LlmProviderCardProps) {
  const labelField = useDraftField(provider.label, (next) => onUpdate(provider.id, { label: next }))
  const baseUrlField = useDraftField(provider.baseUrl, (next) => onUpdate(provider.id, { baseUrl: next }))
  const apiKeyField = useDraftField(provider.apiKey, (next) => onUpdate(provider.id, { apiKey: next }))

  return (
    <div class="settings-role-card">
      <div class="settings-card-head">
        <input
          class="settings-card-label-input"
          value={labelField.draft}
          onInput={(event) => labelField.onInput(event.currentTarget.value)}
          onFocus={labelField.onFocus}
          onBlur={labelField.onBlur}
          placeholder={t('llm-connection-label-placeholder')}
          aria-label={t('llm-connection-label-placeholder')}
        />
        <button
          type="button"
          class="icon-button small danger"
          onClick={() => onDelete(provider.id)}
          title={t('llm-connection-delete')}
          aria-label={t('llm-connection-delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div class="settings-role-body">
        <label>
          <span>Base URL</span>
          <input
            value={baseUrlField.draft}
            onInput={(event) => baseUrlField.onInput(event.currentTarget.value)}
            onFocus={baseUrlField.onFocus}
            onBlur={baseUrlField.onBlur}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          <span>API key</span>
          <input
            type="password"
            value={apiKeyField.draft}
            onInput={(event) => apiKeyField.onInput(event.currentTarget.value)}
            onFocus={apiKeyField.onFocus}
            onBlur={apiKeyField.onBlur}
            placeholder={t('api-key-placeholder')}
            autocomplete="off"
          />
        </label>
      </div>
    </div>
  )
})
