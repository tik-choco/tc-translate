import { Check, Clipboard, ClipboardPaste, Languages, LoaderCircle, Send } from 'lucide-preact'
import type { JSX } from 'preact'
import { t } from '../../i18n'
import { createId } from '../../lib/format'
import { ProviderSetupGuide } from '../../components/ProviderSetupGuide'
import type { ProviderSettings, ReplyResult, TranslationHistoryItem } from '../../types'
import './reply.css'
import { useReplyTranslate } from './useReplyTranslate'

type ReplyPanelProps = {
  settings: ProviderSettings
  nativeLanguage: string
  onOpenSettings: () => void
  providerNeedsSetup: boolean
  onAddHistoryItem: (item: TranslationHistoryItem) => void
}

export function ReplyPanel({
  settings,
  nativeLanguage,
  onOpenSettings,
  providerNeedsSetup,
  onAddHistoryItem,
}: ReplyPanelProps): JSX.Element {
  function handleReplyDone(partnerMessage: string, result: ReplyResult): void {
    onAddHistoryItem({
      id: createId(),
      createdAt: Date.now(),
      kind: 'reply',
      sourceText: partnerMessage,
      targetLanguage: '',
      translations: [],
      notes: [],
      reply: result,
    })
  }

  const reply = useReplyTranslate({ settings, nativeLanguage, onDone: handleReplyDone })

  async function handleCopy(): Promise<void> {
    if (!reply.result) return
    await reply.copyResult(reply.result.translatedReply)
  }

  // Always pastes fresh clipboard content, replacing whatever is currently
  // in the field - pressing it again after copying a new message overwrites
  // the old one rather than switching to some other action.
  async function handlePaste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) reply.setPartnerMessage(text)
    } catch {
      // Clipboard read unavailable or denied; nothing to paste.
    }
  }

  return (
    <div class="reply-panel">
      <div class="reply-field">
        <div class="reply-field-header">
          <label class="reply-label" for="reply-partner-message">
            {t('reply-partner-label')}
          </label>
          <button
            type="button"
            class="icon-button small"
            onClick={() => void handlePaste()}
            title={t('reply-paste-button')}
            aria-label={t('reply-paste-button')}
          >
            <ClipboardPaste size={16} />
          </button>
        </div>
        <textarea
          id="reply-partner-message"
          class="reply-textarea"
          value={reply.partnerMessage}
          onInput={(event) => reply.setPartnerMessage(event.currentTarget.value)}
          placeholder={t('reply-partner-placeholder')}
        />
        <div class="reply-field-buttons">
          <button
            type="button"
            class={`primary-button reply-paste-translate-button ${reply.incomingStatus === 'loading' ? 'loading' : ''}`}
            onClick={() => void reply.handlePasteAndTranslateIncoming()}
            disabled={!reply.providerConfigured || reply.incomingStatus === 'loading'}
            title={t('reply-paste-and-understand-button')}
          >
            {reply.incomingStatus === 'loading' ? <LoaderCircle size={17} /> : <Languages size={17} />}
            {t('reply-paste-and-understand-button')}
          </button>
        </div>
        {reply.incomingStatus === 'loading' ? (
          <span class="loading-line reply-incoming-status">
            <LoaderCircle size={16} />
            {t('reply-translating-incoming')}
          </span>
        ) : reply.incomingError ? (
          <span class="error-text">{reply.incomingError}</span>
        ) : reply.incomingTranslation ? (
          <p class="reply-incoming-translation">{reply.incomingTranslation}</p>
        ) : null}
      </div>

      <div class="reply-field">
        <label class="reply-label" for="reply-own-message">
          {t('reply-own-label')}
        </label>
        <textarea
          id="reply-own-message"
          class="reply-textarea"
          value={reply.ownReply}
          onInput={(event) => reply.setOwnReply(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              void reply.handleTranslate()
            }
          }}
          placeholder={t('reply-own-placeholder')}
        />
      </div>

      <div class="reply-actions">
        <button
          type="button"
          class={`primary-button ${reply.status === 'loading' ? 'loading' : ''}`}
          onClick={() => void reply.handleTranslate()}
          disabled={!reply.canTranslate || reply.status === 'loading'}
          title={providerNeedsSetup ? t('translator-setup-required-hint') : t('reply-translate-button')}
        >
          {reply.status === 'loading' ? <LoaderCircle size={17} /> : <Send size={17} />}
          {t('reply-translate-button')}
          <span class="reply-shortcut-hint">Ctrl + Enter</span>
        </button>
      </div>

      {reply.error ? <span class="error-text">{reply.error}</span> : null}

      <div class="reply-output">
        {providerNeedsSetup ? (
          <ProviderSetupGuide onOpenSettings={onOpenSettings} />
        ) : reply.status === 'loading' ? (
          <span class="loading-line">
            <LoaderCircle size={18} />
            {t('reply-translating')}
          </span>
        ) : reply.result ? (
          <div class="reply-result-wrap">
            <button
              type="button"
              class={`icon-button small reply-result-copy ${reply.copied ? 'copy-success' : ''}`}
              onClick={() => void handleCopy()}
              title={t('translator-copy-corrected')}
              aria-label={t('translator-copy-corrected')}
            >
              {reply.copied ? <Check size={18} /> : <Clipboard size={18} />}
            </button>
            <article class="reply-result-card">
              <pre>{reply.result.translatedReply}</pre>
            </article>
          </div>
        ) : (
          <div class="empty-state">
            <Send size={22} />
            <span>{t('reply-empty')}</span>
          </div>
        )}
      </div>

      <label class="reply-autocopy-toggle">
        <input
          type="checkbox"
          checked={reply.autoCopy}
          onChange={(event) => reply.setAutoCopy(event.currentTarget.checked)}
        />
        {t('reply-autocopy-toggle')}
      </label>
    </div>
  )
}
