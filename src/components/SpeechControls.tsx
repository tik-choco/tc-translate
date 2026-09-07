import { Download, LoaderCircle, Square, Volume2 } from 'lucide-preact'
import { memo } from 'preact/compat'
import { t } from '../i18n'

type SpeechControlsProps = {
  /** Text handed to the TTS engine. */
  text: string
  /** BCP-47 hint for the browser voice; ignored by API/Network engines. */
  lang: string | undefined
  /** Playback id, unique within the panel - identifies which row is speaking. */
  id: string
  /** Title/aria label shown while idle ("stop reading" takes over during playback). */
  label: string
  supported: boolean
  speakingId: string | null
  loadingId: string | null
  onSpeak: (text: string, lang: string | undefined, id: string) => void
  downloadSupported: boolean
  downloadingId: string | null
  onDownload: (text: string, id: string) => void
  iconSize?: number
}

/** Play/stop + download-audio buttons for one piece of text (an example
 * sentence, a vocabulary entry, ...). Mirrors the inline controls the
 * translation/proofread cards render in their headers. */
export const SpeechControls = memo(function SpeechControls({
  text,
  lang,
  id,
  label,
  supported,
  speakingId,
  loadingId,
  onSpeak,
  downloadSupported,
  downloadingId,
  onDownload,
  iconSize = 16,
}: SpeechControlsProps) {
  if (!text.trim() || (!supported && !downloadSupported)) return null

  const speakLabel = speakingId === id ? t('translator-stop-reading') : label

  return (
    <div class="copy-control">
      {supported ? (
        <button
          type="button"
          class="icon-button small"
          onClick={() => onSpeak(text, lang, id)}
          title={speakLabel}
          aria-label={speakLabel}
        >
          {loadingId === id ? (
            <LoaderCircle size={iconSize} class="spin" />
          ) : speakingId === id ? (
            <Square size={iconSize} />
          ) : (
            <Volume2 size={iconSize} />
          )}
        </button>
      ) : null}
      {downloadSupported ? (
        <button
          type="button"
          class="icon-button small"
          onClick={() => onDownload(text, id)}
          title={t('translator-download-audio')}
          aria-label={t('translator-download-audio')}
          disabled={downloadingId === id}
        >
          {downloadingId === id ? <LoaderCircle size={iconSize} class="spin" /> : <Download size={iconSize} />}
        </button>
      ) : null}
    </div>
  )
})
