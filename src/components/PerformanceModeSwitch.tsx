import { Gauge, Leaf, Zap } from 'lucide-preact'
import { memo } from 'preact/compat'
import { performanceModes } from '../constants'
import { t } from '../i18n'
import type { PerformanceMode } from '../types'

const icons: Record<PerformanceMode, typeof Gauge> = {
  normal: Gauge,
  saver: Leaf,
  fast: Zap,
}

type PerformanceModeSwitchProps = {
  mode: PerformanceMode
  onChange: (mode: PerformanceMode) => void
}

// Normal / Saver / Fast segmented control in the Translate tab's submit row.
// The mode is app-wide (it also applies to Reply and Transcribe); it lives
// here because this is where it's switched most, right before translating.
export const PerformanceModeSwitch = memo(function PerformanceModeSwitch({ mode, onChange }: PerformanceModeSwitchProps) {
  return (
    <div class="performance-switch" role="radiogroup" aria-label={t('translator-performance')}>
      {performanceModes.map((option) => {
        const Icon = icons[option]
        const selected = option === mode
        return (
          <button
            type="button"
            role="radio"
            key={option}
            aria-checked={selected}
            class={`performance-option ${option} ${selected ? 'selected' : ''}`}
            onClick={() => onChange(option)}
            title={t(`translator-performance-${option}-hint`)}
          >
            <Icon size={13} aria-hidden="true" />
            {t(`translator-performance-${option}`)}
          </button>
        )
      })}
    </div>
  )
})
