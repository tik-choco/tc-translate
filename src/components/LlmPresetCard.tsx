import { Trash2 } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useDraftField } from '../hooks/useDraftField'
import { t } from '../i18n'
import type { LlmProviderV1, ModelPresetV1 } from '../lib/llmConfig'

type LlmPresetCardProps = {
  preset: ModelPresetV1
  providers: LlmProviderV1[]
  isDefault: boolean
  modelListId: string
  onUpdate: (id: string, patch: Partial<Omit<ModelPresetV1, 'id'>>) => void
  onDelete: (id: string) => void
}

// One named model config in the Settings "Presets" list - see
// SettingsModal.tsx's API tab. Mirrors tc-town's SettingsView preset card:
// a preset just points at one of the connections above plus a model name/
// temperature, and is picked by label wherever a role (default/vision/
// orchestrator/worker) needs a model.
export const LlmPresetCard = memo(function LlmPresetCard({
  preset,
  providers,
  isDefault,
  modelListId,
  onUpdate,
  onDelete,
}: LlmPresetCardProps) {
  const labelField = useDraftField(preset.label, (next) => onUpdate(preset.id, { label: next }))
  const modelField = useDraftField(preset.model, (next) => onUpdate(preset.id, { model: next }))
  const temperatureField = useDraftField(String(preset.temperature ?? 0.2), (next) => {
    const parsed = Number(next)
    if (Number.isFinite(parsed)) onUpdate(preset.id, { temperature: parsed })
  })
  const providerKnown = providers.some((provider) => provider.id === preset.providerId)

  return (
    <div class="settings-role-card">
      <div class="settings-card-head">
        <input
          class="settings-card-label-input"
          value={labelField.draft}
          onInput={(event) => labelField.onInput(event.currentTarget.value)}
          onFocus={labelField.onFocus}
          onBlur={labelField.onBlur}
          placeholder={t('llm-preset-label-placeholder')}
          aria-label={t('llm-preset-label-placeholder')}
        />
        {isDefault ? <span class="settings-badge">{t('llm-preset-default-badge')}</span> : null}
        <button
          type="button"
          class="icon-button small danger"
          onClick={() => onDelete(preset.id)}
          title={t('llm-preset-delete')}
          aria-label={t('llm-preset-delete')}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div class="settings-role-body">
        <label>
          <span>{t('llm-preset-connection-label')}</span>
          <select
            value={preset.providerId}
            onChange={(event) => onUpdate(preset.id, { providerId: event.currentTarget.value })}
            aria-label={t('llm-preset-connection-label')}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label || provider.baseUrl}
              </option>
            ))}
            {!providerKnown ? (
              <option value={preset.providerId}>{t('llm-preset-unknown-connection')}</option>
            ) : null}
          </select>
        </label>
        <label>
          <span>{t('llm-preset-model-label')}</span>
          <input
            value={modelField.draft}
            onInput={(event) => modelField.onInput(event.currentTarget.value)}
            onFocus={modelField.onFocus}
            onBlur={modelField.onBlur}
            list={modelListId}
            placeholder="gpt-4o-mini"
          />
        </label>
        <label>
          <span>{t('llm-preset-temperature-label')}</span>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={temperatureField.draft}
            onInput={(event) => temperatureField.onInput(event.currentTarget.value)}
            onFocus={temperatureField.onFocus}
            onBlur={temperatureField.onBlur}
          />
        </label>
      </div>
    </div>
  )
})
