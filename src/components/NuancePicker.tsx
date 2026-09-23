import { HeartHandshake, SmilePlus } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import { defaultNuance, intimacyLevels, maxNuanceMoods, nuanceDecorations, nuanceEmotions, nuanceMoods } from '../constants'
import { t } from '../i18n'
import { emojiForEmotion, isNuanceActive } from '../lib/nuance'
import type { NuanceMood, TranslationNuance } from '../types'

type NuancePickerProps = {
  nuance: TranslationNuance
  onChange: (nuance: TranslationNuance) => void
}

// Text labels for the active intimacy (unless neutral), moods, and
// decoration, in order.
function nuanceLabels(nuance: TranslationNuance): string[] {
  return [
    ...(nuance.intimacy !== 'neutral' ? [t(`translator-nuance-intimacy-${nuance.intimacy}`)] : []),
    ...nuance.moods.map((mood) => t(`translator-nuance-mood-${mood}`)),
    ...(nuance.decoration !== 'none' ? [t(`translator-nuance-decoration-${nuance.decoration}`)] : []),
  ]
}

/** Full "友達 · やわらかい · 😊" style summary; empty when no nuance applies. */
export function nuanceSummary(nuance: TranslationNuance | null | undefined): string {
  if (!isNuanceActive(nuance)) return ''
  const parts = nuanceLabels(nuance)
  if (nuance.emotion) parts.push(emojiForEmotion(nuance.emotion))
  return parts.join(' · ')
}

// Lives in the input's bottom-right action row. Collapsed it's a single icon
// button (or a small teal pill summarizing the active nuance); expanded it
// opens a popover below the input with the intimacy slider and emotion palette.
export const NuancePicker = memo(function NuancePicker({ nuance, onChange }: NuancePickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const active = isNuanceActive(nuance)
  const levelIndex = Math.max(0, intimacyLevels.indexOf(nuance.intimacy))
  const summary = nuanceSummary(nuance)
  // The collapsed pill shows only the first label plus a "+N" count, so it
  // stays small in the crowded action row; the full summary is in the title.
  const labels = nuanceLabels(nuance)
  const moodLimitReached = nuance.moods.length >= maxNuanceMoods

  function toggleMood(mood: NuanceMood): void {
    if (nuance.moods.includes(mood)) {
      onChange({ ...nuance, moods: nuance.moods.filter((current) => current !== mood) })
    } else if (!moodLimitReached) {
      onChange({ ...nuance, moods: [...nuance.moods, mood] })
    }
  }

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
    <div class="nuance-picker" ref={rootRef}>
      <button
        type="button"
        class={`nuance-button ${active ? 'active' : ''} ${open ? 'open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        title={active ? t('translator-nuance-applied', { nuance: summary }) : t('translator-nuance-title')}
        aria-label={active ? t('translator-nuance-applied', { nuance: summary }) : t('translator-nuance-title')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {active ? (
          <>
            {nuance.emotion ? (
              <span class="nuance-button-emoji" aria-hidden="true">
                {emojiForEmotion(nuance.emotion)}
              </span>
            ) : (
              <HeartHandshake size={15} />
            )}
            {labels.length ? <span class="nuance-button-label">{labels[0]}</span> : null}
            {labels.length > 1 ? <span class="nuance-button-more">+{labels.length - 1}</span> : null}
          </>
        ) : (
          <SmilePlus size={17} />
        )}
      </button>
      {open ? (
        <div class="nuance-popover" role="dialog" aria-label={t('translator-nuance')}>
          <div class="nuance-section">
            <div class="nuance-section-head">
              <span class="nuance-section-title">{t('translator-nuance-intimacy')}</span>
              <strong class="nuance-level-name">{t(`translator-nuance-intimacy-${nuance.intimacy}`)}</strong>
            </div>
            <input
              class="nuance-slider"
              type="range"
              min={0}
              max={intimacyLevels.length - 1}
              step={1}
              value={levelIndex}
              aria-label={t('translator-nuance-intimacy')}
              aria-valuetext={t(`translator-nuance-intimacy-${nuance.intimacy}`)}
              onInput={(event) => {
                const next = intimacyLevels[Number(event.currentTarget.value)]
                if (next) onChange({ ...nuance, intimacy: next })
              }}
            />
            <div class="nuance-slider-ends" aria-hidden="true">
              <span>{t('translator-nuance-intimacy-formal')}</span>
              <span>{t('translator-nuance-intimacy-intimate')}</span>
            </div>
            <p class="nuance-hint">{t(`translator-nuance-intimacy-${nuance.intimacy}-hint`)}</p>
          </div>
          <div class="nuance-section">
            <div class="nuance-section-head">
              <span class="nuance-section-title">{t('translator-nuance-mood')}</span>
              <span class="nuance-limit">{t('translator-nuance-mood-limit', { count: maxNuanceMoods })}</span>
            </div>
            <div class="nuance-moods" role="group" aria-label={t('translator-nuance-mood')}>
              {nuanceMoods.map((mood) => {
                const selected = nuance.moods.includes(mood)
                return (
                  <button
                    type="button"
                    key={mood}
                    aria-pressed={selected}
                    class={`nuance-mood ${selected ? 'selected' : ''}`}
                    onClick={() => toggleMood(mood)}
                    disabled={!selected && moodLimitReached}
                  >
                    {t(`translator-nuance-mood-${mood}`)}
                  </button>
                )
              })}
            </div>
          </div>
          <div class="nuance-section">
            <div class="nuance-section-head">
              <span class="nuance-section-title">{t('translator-nuance-emotion')}</span>
              <strong class="nuance-level-name">
                {nuance.emotion ? t(`translator-nuance-emotion-${nuance.emotion}`) : t('translator-nuance-emotion-none')}
              </strong>
            </div>
            <div class="nuance-emotions" role="radiogroup" aria-label={t('translator-nuance-emotion')}>
              <button
                type="button"
                role="radio"
                aria-checked={!nuance.emotion}
                class={`nuance-emotion none ${!nuance.emotion ? 'selected' : ''}`}
                onClick={() => onChange({ ...nuance, emotion: null })}
                title={t('translator-nuance-emotion-none')}
              >
                {t('translator-nuance-emotion-none')}
              </button>
              {nuanceEmotions.map((option) => (
                <button
                  type="button"
                  role="radio"
                  key={option.id}
                  aria-checked={nuance.emotion === option.id}
                  class={`nuance-emotion ${nuance.emotion === option.id ? 'selected' : ''}`}
                  onClick={() => onChange({ ...nuance, emotion: option.id })}
                  title={t(`translator-nuance-emotion-${option.id}`)}
                  aria-label={t(`translator-nuance-emotion-${option.id}`)}
                >
                  {option.emoji}
                </button>
              ))}
            </div>
          </div>
          <div class="nuance-section">
            <span class="nuance-section-title">{t('translator-nuance-decoration')}</span>
            <div class="nuance-decorations" role="radiogroup" aria-label={t('translator-nuance-decoration')}>
              {nuanceDecorations.map((decoration) => (
                <button
                  type="button"
                  role="radio"
                  key={decoration}
                  aria-checked={nuance.decoration === decoration}
                  class={`nuance-decoration ${nuance.decoration === decoration ? 'selected' : ''}`}
                  onClick={() => onChange({ ...nuance, decoration })}
                >
                  {t(`translator-nuance-decoration-${decoration}`)}
                  {decoration === 'none' ? null : (
                    <span class="nuance-decoration-sample" aria-hidden="true">
                      {decoration === 'emoji' ? '😊' : decoration === 'kaomoji' ? '(^^)' : '😊(^^)'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div class="nuance-footer">
            <button
              type="button"
              class="nuance-reset"
              onClick={() => onChange(defaultNuance)}
              disabled={!active}
            >
              {t('translator-nuance-reset')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
})
