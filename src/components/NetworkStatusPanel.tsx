// Thin app-side wrappers around the shared LLM Network UI from
// @tik-choco/mistai/preact: they pick the library's message catalog to match
// the app's current UI language and keep the prop names the rest of this app
// already uses. All markup/styling lives in the library (mistai-* classes,
// imported via @tik-choco/mistai/ui.css).

import { MESSAGES_EN, MESSAGES_JA, type ConsumerStatus } from '@tik-choco/mistai'
import { ConsumerStatusIndicator } from '@tik-choco/mistai/preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { getUiLanguage, t } from '../i18n'

function mistaiMessages() {
  const messages = getUiLanguage() === 'ja' ? MESSAGES_JA : MESSAGES_EN
  return { ...messages, consumerPhase: { idle: t('connection-phase-idle'), joining: t('connection-phase-joining'), searching: t('connection-phase-searching'), connected: t('connection-phase-connected'), error: t('connection-phase-error') } }
}

type NetworkConsumerIndicatorProps = {
  status: ConsumerStatus
  /** Timestamp (ms) of the last phase transition; shown as "· HH:MM:SS" next to the status. */
  updatedAt?: number
  variant?: 'compact' | 'detailed'
}

export function NetworkConsumerIndicator({ status, updatedAt, variant = 'compact' }: NetworkConsumerIndicatorProps) {
  const header = useRef<HTMLSpanElement>(null)
  const messages = mistaiMessages()
  const tooltip = [messages.consumerPhase[status.phase], updatedAt ? t('connection-updated', { time: new Date(updatedAt).toLocaleTimeString() }) : '', status.phase === 'error' ? status.message : '', status.phase === 'connected' ? `provider: ${status.providerId}` : t('network-consumer-note')].filter(Boolean).join(' · ')
  useLayoutEffect(() => {
    const button = header.current?.querySelector('button')
    if (button && variant === 'compact') button.title = tooltip
  }, [tooltip, variant])
  return (
    <span ref={header} class="room-header-status" title={tooltip}>
    <ConsumerStatusIndicator
      status={status}
      updatedAt={variant === 'detailed' ? updatedAt : undefined}
      variant={variant}
      note={t('network-consumer-note')}
      messages={messages}
    />
    </span>
  )
}
