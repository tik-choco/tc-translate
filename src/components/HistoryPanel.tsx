import { Check, GraduationCap, X } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useMemo, useState } from 'preact/hooks'
import { t } from '../i18n'
import { toneDisplayName } from '../lib/language'
import type { HistoryKind, TranslationHistoryItem } from '../types'

const historyDateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

type HistoryPanelProps = {
  history: TranslationHistoryItem[]
  onSelect: (item: TranslationHistoryItem) => void
  onDelete: (id: string) => void
  onClear: () => void
  onSend: (id: string) => void
  /** Id of the item whose send-to-Lingo just succeeded (transient checkmark). */
  sentId: string
}

type HistoryFilter = 'all' | HistoryKind

const FILTERS: { value: HistoryFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'history-filter-all' },
  { value: 'translate', labelKey: 'history-kind-translate' },
  { value: 'proofread', labelKey: 'history-kind-proofread' },
  { value: 'explain', labelKey: 'history-kind-explain' },
]

function kindLabel(kind: HistoryKind) {
  if (kind === 'proofread') return t('history-kind-proofread')
  if (kind === 'explain') return t('history-kind-explain')
  return t('history-kind-translate')
}

export const HistoryPanel = memo(function HistoryPanel({ history, onSelect, onDelete, onClear, onSend, sentId }: HistoryPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const distinctKinds = useMemo(() => new Set(history.map((item) => item.kind)), [history])
  // Fall back to 'all' when the selected kind's last item was deleted, so the
  // list can't get stuck empty behind a hidden filter row.
  const effectiveFilter = filter === 'all' || distinctKinds.has(filter) ? filter : 'all'
  const items = effectiveFilter === 'all' ? history : history.filter((item) => item.kind === effectiveFilter)
  const visibleFilters = FILTERS.filter((entry) => entry.value === 'all' || distinctKinds.has(entry.value))

  return (
    <aside class="history-panel">
      <h2>{t('history-title')}</h2>
      {distinctKinds.size >= 2 && (
        <div class="history-filters">
          {visibleFilters.map((entry) => (
            <button
              type="button"
              key={entry.value}
              class={`history-filter-chip${effectiveFilter === entry.value ? ' active' : ''}`}
              onClick={() => setFilter(entry.value)}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
      )}
      {items.length ? (
        <div class="history-list">
          {items.map((item) => (
            <article class="history-card" key={item.id}>
              <button type="button" class="history-select" onClick={() => onSelect(item)}>
                <span class="history-meta">
                  {item.kind === 'translate' ? (
                    <span>{item.targetLanguage}</span>
                  ) : (
                    <span class="history-kind-badge">{kindLabel(item.kind)}</span>
                  )}
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {historyDateFormat.format(item.createdAt)}
                  </time>
                </span>
                <strong>{item.sourceText}</strong>
                {item.kind === 'translate' && (
                  <span class="history-variants">
                    {item.translations.map((translation) => (
                      <span key={translation.tone}>
                        <b>{toneDisplayName(translation.tone)}</b>
                        {translation.text}
                      </span>
                    ))}
                  </span>
                )}
                {item.kind === 'proofread' && item.proofread && (
                  <span class="history-preview">
                    <b>{t('translator-corrected-text')}</b>
                    {item.proofread.correctedText}
                  </span>
                )}
                {item.kind === 'explain' && item.explanation && (
                  <span class="history-preview">{item.explanation.overview}</span>
                )}
              </button>
              {item.kind !== 'proofread' && (
                <button
                  type="button"
                  class={`history-send${sentId === item.id ? ' history-send-success' : ''}`}
                  onClick={() => onSend(item.id)}
                  title={t('history-send-to-lingo')}
                  aria-label={t('history-send-to-lingo')}
                >
                  {sentId === item.id ? <Check size={14} /> : <GraduationCap size={14} />}
                </button>
              )}
              <button
                type="button"
                class="history-delete"
                onClick={() => onDelete(item.id)}
                title={t('history-delete-item')}
                aria-label={t('history-delete-item')}
              >
                <X size={14} />
              </button>
            </article>
          ))}
          <button type="button" class="history-clear" onClick={onClear}>
            {t('history-clear-all')}
          </button>
        </div>
      ) : (
        <p class="history-empty">{t('history-empty')}</p>
      )}
    </aside>
  )
})
