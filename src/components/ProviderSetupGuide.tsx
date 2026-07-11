import { Settings, Sparkles } from 'lucide-preact'
import { t } from '../i18n'

type ProviderSetupGuideProps = {
  onOpenSettings: () => void
}

// Shown in place of the translate/proofread output whenever no translation
// engine is configured yet (neither an API base URL + model, nor an LLM
// Network room). Points first-time users straight at Settings instead of
// leaving them to guess why the buttons are disabled.
export function ProviderSetupGuide({ onOpenSettings }: ProviderSetupGuideProps) {
  return (
    <div class="setup-guide">
      <span class="setup-guide-icon" aria-hidden="true">
        <Sparkles size={22} />
      </span>
      <strong>{t('setup-guide-title')}</strong>
      <p>{t('setup-guide-body')}</p>
      <button type="button" class="primary-button" onClick={onOpenSettings}>
        <Settings size={16} />
        {t('setup-guide-button')}
      </button>
    </div>
  )
}
