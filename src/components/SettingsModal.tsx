import { LlmSettings, type LlmSettingsLocalAdapter } from '@tik-choco/mistai/preact'
import { languageOptions } from '../constants'
import { getUiLanguage, t } from '../i18n'
import { languageOptionLabel } from '../lib/language'
import type { SttSettings } from '../types'
import { useMicrophones } from '../hooks/useMicrophones'
import { MistBuildBanner } from './MistBuildBanner'

type SettingsModalProps = {
  nativeLanguage: string; onUpdateNativeLanguage: (next: string) => void;
  localSettings: LlmSettingsLocalAdapter; onClose: () => void;
  sttSettings: SttSettings; onUpdateSttSettings: (next: SttSettings) => void;
  onOpenOnboarding: () => void;
}

export function SettingsModal(props: SettingsModalProps) {
  const mic = useMicrophones()
  return <LlmSettings
    title={t('settings')} locale={getUiLanguage()} onClose={props.onClose}
    tasks={[
      { id: 'default', label: t('models-task-default'), tip: t('models-task-default'), reasoning: true },
      { id: 'vision', label: t('models-task-vision'), tip: t('models-task-vision'), reasoning: true },
    ]}
    localSettings={props.localSettings} voice={{ tts: {}, stt: {} }}
    mic={mic.enumerationSupported ? {
      deviceId: props.sttSettings.micDeviceId,
      onChange: micDeviceId => props.onUpdateSttSettings({ ...props.sttSettings, micDeviceId }),
      devices: mic.microphones, labelsHidden: mic.labelsHidden, onUnlockLabels: mic.unlockLabels,
    } : undefined}
    headerSection={<div class="ui-language-row"><span>{t('ob-native-language')}</span>
      <select value={props.nativeLanguage} onChange={event => props.onUpdateNativeLanguage(event.currentTarget.value)}>
        {languageOptions.map(language => <option value={language}>{languageOptionLabel(language)}</option>)}
      </select>
    </div>}
    extraSections={tab => tab === 'connection' ? <>
      <button type="button" class="link-button" onClick={props.onOpenOnboarding}>{t('ob-reopen')}</button>
      <MistBuildBanner />
    </> : null}
  />
}
