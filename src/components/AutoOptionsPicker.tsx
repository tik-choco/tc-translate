import { WandSparkles } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'

type AutoOptionsPickerProps = {
  backTranslate: boolean
  onBackTranslateChange: (value: boolean) => void
  copy: boolean
  onCopyChange: (value: boolean) => void
}

// "Auto" pill shared by the Translate and Reply tabs: one compact button
// (teal with a count while anything is on) that opens a small popover with
// the after-translation automations, instead of a row of loose checkboxes.
export const AutoOptionsPicker = memo(function AutoOptionsPicker({
  backTranslate,
  onBackTranslateChange,
  copy,
  onCopyChange,
}: AutoOptionsPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const enabledCount = Number(backTranslate) + Number(copy)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node | null)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div class="auto-options" ref={rootRef}>
      <button
        type="button"
        class={`auto-options-button ${enabledCount ? 'active' : ''} ${open ? 'open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <WandSparkles size={14} aria-hidden="true" />
        {t('auto-options')}
        {enabledCount ? <span class="auto-options-count">{enabledCount}</span> : null}
      </button>
      {open ? (
        <div class="auto-options-popover" role="dialog" aria-label={t('auto-options')}>
          <span class="auto-options-title">{t('auto-options-title')}</span>
          <label class="auto-option">
            <input
              type="checkbox"
              checked={backTranslate}
              onChange={(event) => onBackTranslateChange(event.currentTarget.checked)}
            />
            <span class="auto-option-text">
              <strong>{t('auto-options-back-translate')}</strong>
              <small>{t('auto-options-back-translate-hint')}</small>
            </span>
          </label>
          <label class="auto-option">
            <input type="checkbox" checked={copy} onChange={(event) => onCopyChange(event.currentTarget.checked)} />
            <span class="auto-option-text">
              <strong>{t('auto-options-copy')}</strong>
              <small>{t('auto-options-copy-hint')}</small>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  )
})
