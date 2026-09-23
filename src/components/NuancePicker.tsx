import { HeartHandshake, Pause, SmilePlus } from 'lucide-preact'
import { memo } from 'preact/compat'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import {
  defaultNuance,
  intimacyLevels,
  maxNuanceMoods,
  nuanceDecorations,
  nuanceEmotions,
  nuanceMoods,
  nuanceStances,
} from '../constants'
import { t } from '../i18n'
import { emojiForEmotion, hasNuanceSettings, isNuanceActive } from '../lib/nuance'
import type { NuanceMood, TranslationNuance } from '../types'

// Space kept between the popover and the bottom of the viewport, and the
// smallest height worth showing before scrolling it into view instead.
const popoverViewportMargin = 12
const popoverMinHeight = 240

// One stepped slider (intimacy, stance). Labels come from
// `translator-nuance-<group>-<level>` and `...-<level>-hint`; the two ends of
// the scale are labelled under the track.
function NuanceSlider<T extends string>({
  group,
  levels,
  value,
  onChange,
}: {
  group: 'intimacy' | 'stance'
  levels: T[]
  value: T
  onChange: (value: T) => void
}) {
  const index = Math.max(0, levels.indexOf(value))
  return (
    <div class="nuance-section">
      <div class="nuance-section-head">
        <span class="nuance-section-title">{t(`translator-nuance-${group}`)}</span>
        <strong class="nuance-level-name">{t(`translator-nuance-${group}-${value}`)}</strong>
      </div>
      <input
        class="nuance-slider"
        type="range"
        min={0}
        max={levels.length - 1}
        step={1}
        value={index}
        aria-label={t(`translator-nuance-${group}`)}
        aria-valuetext={t(`translator-nuance-${group}-${value}`)}
        onInput={(event) => {
          const next = levels[Number(event.currentTarget.value)]
          if (next) onChange(next)
        }}
      />
      <div class="nuance-slider-ends" aria-hidden="true">
        <span>{t(`translator-nuance-${group}-${levels[0]}`)}</span>
        <span>{t(`translator-nuance-${group}-${levels[levels.length - 1]}`)}</span>
      </div>
      <p class="nuance-hint">{t(`translator-nuance-${group}-${value}-hint`)}</p>
    </div>
  )
}

type NuancePickerProps = {
  nuance: TranslationNuance
  onChange: (nuance: TranslationNuance) => void
}

// Text labels for the active (non-default) intimacy, stance, moods, and
// decoration, in order.
function nuanceLabels(nuance: TranslationNuance): string[] {
  return [
    ...(nuance.intimacy !== 'neutral' ? [t(`translator-nuance-intimacy-${nuance.intimacy}`)] : []),
    ...(nuance.stance !== 'equal' ? [t(`translator-nuance-stance-${nuance.stance}`)] : []),
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
  const popoverRef = useRef<HTMLDivElement>(null)
  // More content below the popover's visible area: shows a bottom fade so the
  // cut-off edge reads as "scroll for more" rather than the end of the panel.
  const [moreBelow, setMoreBelow] = useState(false)
  // `configured`: something is set (even if paused); `active`: it will be
  // applied to the next translation.
  const configured = hasNuanceSettings(nuance)
  const active = isNuanceActive(nuance)
  const paused = configured && nuance.paused
  const labels = nuanceLabels(nuance)
  const summary = [...labels, ...(nuance.emotion ? [emojiForEmotion(nuance.emotion)] : [])].join(' · ')
  const buttonTitle = active
    ? t('translator-nuance-applied', { nuance: summary })
    : paused
      ? t('translator-nuance-paused', { nuance: summary })
      : t('translator-nuance-title')
  // The collapsed pill shows only the first label plus a "+N" count, so it
  // stays small in the crowded action row; the full summary is in the title.
  const moodLimitReached = nuance.moods.length >= maxNuanceMoods

  function toggleMood(mood: NuanceMood): void {
    if (nuance.moods.includes(mood)) {
      onChange({ ...nuance, moods: nuance.moods.filter((current) => current !== mood) })
    } else if (!moodLimitReached) {
      onChange({ ...nuance, moods: [...nuance.moods, mood] })
    }
  }

  // The popover drops below the input, which can sit anywhere on screen (a
  // banner above, a scrolled page on mobile), so size it to the space that is
  // actually left under it. A fixed CSS max-height let its bottom slip off
  // screen, where neither the popover nor the page could scroll it into view.
  useLayoutEffect(() => {
    const popover = popoverRef.current
    if (!open || !popover) return
    const el: HTMLDivElement = popover

    function updateMoreBelow(): void {
      setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
    }
    function fit(): boolean {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const available = Math.floor(viewportHeight - el.getBoundingClientRect().top - popoverViewportMargin)
      el.style.maxHeight = `${Math.max(popoverMinHeight, available)}px`
      updateMoreBelow()
      return available >= popoverMinHeight
    }

    // Too little room even for the minimum height: scroll the page/translator
    // so the popover comes fully into view (only on open, not on every scroll).
    if (!fit()) el.scrollIntoView({ block: 'nearest' })
    const refit = () => void fit()
    window.addEventListener('resize', refit)
    window.visualViewport?.addEventListener('resize', refit)
    document.addEventListener('scroll', refit, true)
    el.addEventListener('scroll', updateMoreBelow)
    return () => {
      window.removeEventListener('resize', refit)
      window.visualViewport?.removeEventListener('resize', refit)
      document.removeEventListener('scroll', refit, true)
      el.removeEventListener('scroll', updateMoreBelow)
    }
  }, [open])

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
        class={`nuance-button ${active ? 'active' : ''} ${paused ? 'paused' : ''} ${open ? 'open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        title={buttonTitle}
        aria-label={buttonTitle}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {configured ? (
          <>
            {paused ? <Pause size={13} aria-hidden="true" /> : null}
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
        <div
          ref={popoverRef}
          class={`nuance-popover ${paused ? 'paused' : ''}`}
          role="dialog"
          aria-label={t('translator-nuance')}
        >
          {/* Pause sits at the top so switching it off (e.g. to translate the
              other person's reply) doesn't require scrolling the popover. */}
          <div class="nuance-header">
            <span class="nuance-header-title">{t('translator-nuance')}</span>
            <button
              type="button"
              class={`nuance-pause ${paused ? 'selected' : ''}`}
              aria-pressed={paused}
              onClick={() => onChange({ ...nuance, paused: !nuance.paused })}
              disabled={!configured}
              title={t('translator-nuance-pause-hint')}
            >
              <Pause size={13} aria-hidden="true" />
              {t('translator-nuance-pause')}
            </button>
          </div>
          <NuanceSlider
            group="intimacy"
            levels={intimacyLevels}
            value={nuance.intimacy}
            onChange={(intimacy) => onChange({ ...nuance, intimacy })}
          />
          <NuanceSlider
            group="stance"
            levels={nuanceStances}
            value={nuance.stance}
            onChange={(stance) => onChange({ ...nuance, stance })}
          />
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
              disabled={!configured}
            >
              {t('translator-nuance-reset')}
            </button>
          </div>
          <div class={`nuance-scroll-fade ${moreBelow ? 'visible' : ''}`} aria-hidden="true" />
        </div>
      ) : null}
    </div>
  )
})
