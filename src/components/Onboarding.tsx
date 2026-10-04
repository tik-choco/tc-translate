// First-run wizard shown by app.tsx as a modal: welcome + native language ->
// AI connection (optional) -> feature tour. Every step is skippable and
// closing at any point counts as "seen" (the flag is owned by the caller via
// `onClose`); Settings can re-open it any time.
// Ported from tc-books' src/components/Onboarding.tsx.

import { useEffect, useState } from 'preact/hooks'
import {
  ArrowLeft,
  ArrowRight,
  BookType,
  Check,
  Cpu,
  History,
  Languages,
  Mic,
  Plug,
  Send,
  Sparkles,
  SpellCheck,
  X,
} from 'lucide-preact'
import { formatMistaiError, MESSAGES_EN, MESSAGES_JA } from '@tik-choco/mistai'
import { languageOptions } from '../constants'
import { getUiLanguage, t } from '../i18n'
import { fetchModelIds } from '../lib/api'
import { languageOptionLabel } from '../lib/language'
import { requestChatCompletion } from '../lib/llm'
import { isNetworkProviderBaseUrl } from '@tik-choco/mistai/llm-config'
import type { ProviderSettings } from '../types'
import '../styles/onboarding.css'

const STEP_COUNT = 3

type LlmDraft = { baseUrl: string; apiKey: string; model: string }
type TestState = { phase: 'idle' } | { phase: 'busy' } | { phase: 'ok' } | { phase: 'error'; message: string }

type OnboardingProps = {
  nativeLanguage: string
  onNativeLanguageChange: (language: string) => void
  settings: ProviderSettings
  onApplyConnection: (draft: LlmDraft) => void
  onClose: () => void
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

/** Automatically fills a datalist for the draft connection, with manual entry as a fallback. */
function ModelField({ value, baseUrl, apiKey, onChange }: { value: string; baseUrl: string; apiKey: string; onChange: (model: string) => void }) {
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(false)
    if (!baseUrl.trim()) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try { setOptions(await fetchModelIds({ baseUrl, apiKey }, controller.signal)) }
      catch { /* Keep the previous list and allow manual entry. */ }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [baseUrl, apiKey])

  return (
    <div class="ob-model-row">
      <input
        class="ob-input"
        list="ob-model-options"
        type="text"
        placeholder={t('ob-model-placeholder')}
        value={value}
        onInput={(event) => onChange(inputValue(event))}
      />
      <datalist id="ob-model-options">
        {options.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      {loading && <span class="ob-spinner" role="status" aria-label={t('models-fetching')} />}
    </div>
  )
}

export function Onboarding({ nativeLanguage, onNativeLanguageChange, settings, onApplyConnection, onClose }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [llm, setLlm] = useState<LlmDraft>(() => {
    const provider = settings.providers.find(p => p.id === settings.defaultModel?.providerId)
    return provider && provider.enabled !== false && settings.defaultModel && !isNetworkProviderBaseUrl(provider.baseUrl)
      ? { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: settings.defaultModel.model }
      : { baseUrl: '', apiKey: '', model: '' }
  })
  const [test, setTest] = useState<TestState>({ phase: 'idle' })
  const filled = Boolean(llm.baseUrl.trim() && llm.model.trim())

  function update(patch: Partial<LlmDraft>): void {
    setLlm((prev) => ({ ...prev, ...patch }))
    // Edited values invalidate a previous test result.
    setTest({ phase: 'idle' })
  }

  async function runTest(): Promise<void> {
    if (test.phase === 'busy') return
    setTest({ phase: 'busy' })
    try {
      await requestChatCompletion({
        settings: { ...settings, baseUrl: llm.baseUrl, apiKey: llm.apiKey, model: llm.model, reasoningEffort: 'none' },
        messages: [{ role: 'user', content: 'Connection test. Reply with just "OK".' }],
        signal: AbortSignal.timeout(60_000),
      })
      setTest({ phase: 'ok' })
    } catch (error) {
      const messages = getUiLanguage() === 'ja' ? MESSAGES_JA : MESSAGES_EN
      setTest({ phase: 'error', message: formatMistaiError(error, messages, t('ob-test-failed')) })
    }
  }

  function next(): void {
    // Leaving the fields blank keeps the current settings untouched.
    if (filled) onApplyConnection(llm)
    setStep(2)
  }

  const features = [
    { icon: Languages, name: 'ob-feature-translate' },
    { icon: SpellCheck, name: 'ob-feature-tools' },
    { icon: Send, name: 'ob-feature-reply' },
    { icon: BookType, name: 'ob-feature-kanji' },
    { icon: Mic, name: 'ob-feature-transcribe' },
    { icon: History, name: 'ob-feature-history' },
  ]

  return (
    <div class="ob-overlay">
      <div class="ob-card" role="dialog" aria-modal="true" aria-label={t('ob-label')}>
        <button class="ob-close" type="button" onClick={onClose} title={t('close-settings')} aria-label={t('close-settings')}>
          <X size={18} />
        </button>

        {step === 0 ? (
          <div class="ob-body">
            <div class="ob-hero">
              <Sparkles size={34} />
            </div>
            <h2 class="ob-title">{t('ob-welcome')}</h2>
            <p class="ob-text">{t('ob-intro')}</p>
            <label class="ob-field">
              <span class="ob-label">{t('ob-native-language')}</span>
              <select class="ob-input" value={nativeLanguage} onChange={(event) => onNativeLanguageChange(event.currentTarget.value)}>
                {languageOptions.map((language) => (
                  <option key={language} value={language}>
                    {languageOptionLabel(language)}
                  </option>
                ))}
              </select>
              <span class="ob-text-subtle">{t('ob-native-language-hint')}</span>
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div class="ob-body">
            <div class="ob-step-head">
              <Cpu size={20} />
              <h2 class="ob-title">{t('ob-llm-title')}</h2>
            </div>
            <p class="ob-text">{t('ob-llm-lead')}</p>
            <label class="ob-field">
              <span class="ob-label">{t('ob-base-url')}</span>
              <input
                class="ob-input"
                type="text"
                placeholder="https://api.openai.com/v1 / http://localhost:1234/v1"
                value={llm.baseUrl}
                onInput={(event) => update({ baseUrl: inputValue(event) })}
              />
            </label>
            <label class="ob-field">
              <span class="ob-label">{t('ob-api-key')}</span>
              <input
                class="ob-input"
                type="password"
                placeholder="sk-..."
                value={llm.apiKey}
                onInput={(event) => update({ apiKey: inputValue(event) })}
              />
            </label>
            <div class="ob-field">
              <span class="ob-label">{t('ob-model')}</span>
              <ModelField value={llm.model} baseUrl={llm.baseUrl} apiKey={llm.apiKey} onChange={(model) => update({ model })} />
            </div>
            <div class="ob-test-row">
              <button class="ob-btn" type="button" onClick={() => void runTest()} disabled={test.phase === 'busy' || !filled}>
                {test.phase === 'busy' ? <span class="ob-spinner" /> : <Plug size={15} />}
                {test.phase === 'busy' ? t('ob-testing') : t('ob-test')}
              </button>
              {test.phase === 'ok' ? (
                <span class="ob-test-ok">
                  <Check size={15} />
                  {t('ob-test-ok')}
                </span>
              ) : null}
            </div>
            {test.phase === 'error' ? (
              <p class="ob-error" role="alert">
                {t('ob-test-failed')}: {test.message}
              </p>
            ) : null}
            <p class="ob-text-subtle">{t('ob-llm-note')}</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div class="ob-body">
            <div class="ob-step-head">
              <Check size={20} />
              <h2 class="ob-title">{t('ob-done-title')}</h2>
            </div>
            <ul class="ob-feature-list">
              {features.map(({ icon: Icon, name }) => (
                <li key={name}>
                  <Icon size={16} />
                  <span>
                    <strong>{t(name)}</strong> — {t(`${name}-text`)}
                  </span>
                </li>
              ))}
            </ul>
            <p class="ob-text-subtle">{t('ob-done-note')}</p>
          </div>
        ) : null}

        <footer class="ob-footer">
          <div class="ob-dots" aria-hidden="true">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <span key={i} class={`ob-dot ${i === step ? 'is-active' : ''}`} />
            ))}
          </div>
          <div class="ob-footer-actions">
            {step > 0 ? (
              <button class="ob-btn" type="button" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={15} />
                {t('ob-back')}
              </button>
            ) : null}
            {step === 0 ? (
              <button class="ob-btn ob-btn-accent" type="button" onClick={() => setStep(1)}>
                {t('ob-start')}
                <ArrowRight size={15} />
              </button>
            ) : null}
            {step === 1 ? (
              <button class="ob-btn ob-btn-accent" type="button" onClick={next}>
                {filled ? t('ob-save-next') : t('ob-skip')}
                <ArrowRight size={15} />
              </button>
            ) : null}
            {step === 2 ? (
              <button class="ob-btn ob-btn-accent" type="button" onClick={onClose}>
                <Check size={15} />
                {t('ob-finish')}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  )
}
