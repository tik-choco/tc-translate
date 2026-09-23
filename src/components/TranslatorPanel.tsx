import { BookOpen, ClipboardPaste, Download, FileUp, LoaderCircle, Mic, NotebookText, PenLine, Play, ScanText, Square, Volume2, X } from 'lucide-preact'
import type { Ref } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'
import type { PdfPageProgress } from '../hooks/usePdfImport'
import { formatBytes, getFirstAudioFile, getFirstImageFile, getFirstPdfFile } from '../lib/format'
import { detectScript, speechCodeForScript } from '../lib/language'
import { ExampleOutput } from './ExampleOutput'
import { ExplainOutput } from './ExplainOutput'
import { NuancePicker } from './NuancePicker'
import { PerformanceModeSwitch } from './PerformanceModeSwitch'
import { ProofreadOutput } from './ProofreadOutput'
import { TranslationOutput } from './TranslationOutput'
import type {
  AppMode,
  BackTranslationCheck,
  ExampleResult,
  ExplanationResult,
  ExplanationRubyToken,
  ImageInput,
  PerformanceMode,
  ProofreadResult,
  Status,
  TranslationHistoryItem,
  TranslationNuance,
  TranslationResult,
  TranslationVariant,
} from '../types'

type TranslatorPanelProps = {
  inputRef: Ref<HTMLTextAreaElement>
  fileInputRef: Ref<HTMLInputElement>
  sourceText: string
  setSourceText: (value: string) => void
  imageInput: ImageInput | null
  isReadingImage: boolean
  imageImportError: string
  mode: AppMode
  onImageFile: (file: File | null | undefined) => void
  onClearImage: () => void
  onClearInput: () => void
  status: Status
  canTranslate: boolean
  canProofread: boolean
  canExplain: boolean
  canExample: boolean
  onTranslate: () => void
  canPasteAndTranslate: boolean
  onPasteAndTranslate: () => void
  onCancelTranslate: () => void
  onProofread: () => void
  onExplain: () => void
  onExample: () => void
  selectedHistory: TranslationHistoryItem | null
  result: TranslationResult | null
  streamingTranslations: TranslationVariant[]
  proofreadStatus: Status
  proofreadResult: ProofreadResult | null
  explainStatus: Status
  explainResult: ExplanationResult | null
  explainRubyStatus: Status
  explainRubyTokens: ExplanationRubyToken[]
  exampleStatus: Status
  exampleResult: ExampleResult | null
  targetLanguage: string
  copiedTone: string
  copiedProofread: boolean
  onCopyTranslation: (translation: TranslationVariant) => void
  onCopyProofread: () => void
  backTranslationStatus: Status
  canCheckBackTranslation: boolean
  onCheckBackTranslation: () => void
  backTranslation: BackTranslationCheck | null
  error: string
  nativeLanguage: string
  nuance: TranslationNuance
  onNuanceChange: (nuance: TranslationNuance) => void
  performanceMode: PerformanceMode
  onPerformanceModeChange: (mode: PerformanceMode) => void
  speechSupported: boolean
  speakingId: string | null
  speechLoadingId: string | null
  onSpeak: (text: string, lang: string | undefined, id: string) => void
  speechDownloadSupported: boolean
  speechDownloadingId: string | null
  onDownloadSpeech: (text: string, id: string) => void
  micSupported: boolean
  isRecording: boolean
  isTranscribing: boolean
  transcriptionError: string
  liveTranscript: string
  onToggleRecording: () => void
  onAudioFile: (file: File) => void
  isImportingPdf: boolean
  pdfImportError: string
  pdfPageProgress: PdfPageProgress | null
  onPdfFile: (file: File) => void
  providerNeedsSetup: boolean
  onOpenSettings: () => void
}

function paneRects(translator: HTMLElement): DOMRect[] {
  return [...translator.querySelectorAll('.pane-grid > .text-pane')].map((pane) => pane.getBoundingClientRect())
}

export function TranslatorPanel({
  inputRef,
  fileInputRef,
  sourceText,
  setSourceText,
  imageInput,
  isReadingImage,
  imageImportError,
  mode,
  onImageFile,
  onClearImage,
  onClearInput,
  status,
  canTranslate,
  canProofread,
  canExplain,
  canExample,
  onTranslate,
  canPasteAndTranslate,
  onPasteAndTranslate,
  onCancelTranslate,
  onProofread,
  onExplain,
  onExample,
  selectedHistory,
  result,
  streamingTranslations,
  proofreadStatus,
  proofreadResult,
  explainStatus,
  explainResult,
  explainRubyStatus,
  explainRubyTokens,
  exampleStatus,
  exampleResult,
  targetLanguage,
  copiedTone,
  copiedProofread,
  onCopyTranslation,
  onCopyProofread,
  backTranslationStatus,
  canCheckBackTranslation,
  onCheckBackTranslation,
  backTranslation,
  error,
  nativeLanguage,
  nuance,
  onNuanceChange,
  performanceMode,
  onPerformanceModeChange,
  speechSupported,
  speakingId,
  speechLoadingId,
  onSpeak,
  speechDownloadSupported,
  speechDownloadingId,
  onDownloadSpeech,
  micSupported,
  isRecording,
  isTranscribing,
  transcriptionError,
  liveTranscript,
  onToggleRecording,
  onAudioFile,
  isImportingPdf,
  pdfImportError,
  pdfPageProgress,
  onPdfFile,
  providerNeedsSetup,
  onOpenSettings,
}: TranslatorPanelProps) {
  const placeholder = imageInput ? t('translator-placeholder-image') : t('translator-placeholder-default')
  const sourceSpeechId = 'source-text'
  const canSpeakSource = speechSupported && Boolean(sourceText.trim())
  const sourceSpeechLang = useMemo(
    () => (canSpeakSource ? speechCodeForScript(detectScript(sourceText)) : undefined),
    [canSpeakSource, sourceText],
  )
  const hasOutput =
    providerNeedsSetup ||
    (mode === 'proofread'
      ? Boolean(proofreadResult) || proofreadStatus === 'loading'
      : mode === 'explain'
        ? Boolean(explainResult) || explainStatus === 'loading'
        : mode === 'example'
          ? Boolean(exampleResult) || exampleStatus === 'loading'
          : Boolean(result) || Boolean(selectedHistory) || status === 'loading')
  // Side-by-side (wide screens only, see layout.css) kicks in once the
  // stacked layout overflows the translator, i.e. the result would need
  // scrolling to read. The decision sticks until the text behind the output or
  // the mode changes: side-by-side is shorter, so re-measuring there would
  // flip straight back. Judged on the text the shown output came from, so
  // typing a new input doesn't flip the layout.
  const translatorRef = useRef<HTMLDivElement>(null)
  const [sideBySide, setSideBySide] = useState(false)
  const outputSourceText =
    mode === 'translate' ? (result?.sourceText ?? selectedHistory?.sourceText ?? sourceText) : sourceText
  const layoutKey = hasOutput ? `${mode}:${outputSourceText}` : ''

  useLayoutEffect(() => {
    setSideBySide(false)
  }, [layoutKey])

  // FLIP: after switching to side-by-side, slide each pane from where it was
  // in the stacked layout to its new spot instead of jumping.
  const flipFromRef = useRef<DOMRect[] | null>(null)
  useLayoutEffect(() => {
    const from = flipFromRef.current
    flipFromRef.current = null
    const translator = translatorRef.current
    if (!sideBySide || !from || !translator) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const panes = translator.querySelectorAll<HTMLElement>('.pane-grid > .text-pane')
    paneRects(translator).forEach((to, index) => {
      const start = from[index]
      const pane = panes[index]
      if (!start || !pane) return
      const dx = start.left - to.left
      const dy = start.top - to.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      pane.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 420,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      })
    })
  }, [sideBySide])

  useLayoutEffect(() => {
    const translator = translatorRef.current
    const grid = translator?.querySelector('.pane-grid')
    if (!layoutKey || sideBySide || !translator || !grid) return
    const el: HTMLDivElement = translator

    function check(): void {
      if (el.scrollHeight <= el.clientHeight + 1) return
      flipFromRef.current = paneRects(el)
      setSideBySide(true)
    }
    check()
    // Re-check as the output grows (streaming, late notes) or the pane resizes.
    const observer = new ResizeObserver(check)
    observer.observe(grid)
    observer.observe(el)
    return () => observer.disconnect()
  }, [layoutKey, sideBySide])

  // Fallback auto-grow for browsers without `field-sizing: content` support.
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) return
    const textarea = (inputRef as { current: HTMLTextAreaElement | null }).current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 520)}px`
  }, [sourceText, imageInput, inputRef])

  function handleDrop(event: DragEvent): void {
    const files = event.dataTransfer?.files
    const audioFile = getFirstAudioFile(files)
    if (audioFile) {
      event.preventDefault()
      onAudioFile(audioFile)
      return
    }

    const pdfFile = getFirstPdfFile(files)
    if (pdfFile) {
      event.preventDefault()
      onPdfFile(pdfFile)
      return
    }

    const imageFile = getFirstImageFile(files)
    if (imageFile) {
      event.preventDefault()
      onImageFile(imageFile)
    }
  }

  return (
    <div
      ref={translatorRef}
      class={`translator ${hasOutput ? 'has-output' : 'no-output'} ${hasOutput && sideBySide ? 'side-by-side' : ''}`}
    >
      <div class="pane-grid">
        <div class="text-pane">
          <div class={`input-shell ${imageInput ? 'has-image' : ''}`}>
            <textarea
              ref={inputRef}
              value={sourceText}
              onInput={(event) => setSourceText(event.currentTarget.value)}
              onPaste={(event) => {
                const pdfFile = getFirstPdfFile(event.clipboardData?.files)
                if (pdfFile) {
                  event.preventDefault()
                  onPdfFile(pdfFile)
                  return
                }

                const imageFile = getFirstImageFile(event.clipboardData?.files)
                if (!imageFile) return
                event.preventDefault()
                onImageFile(imageFile)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onKeyDown={(event) => {
                // Shift+Ctrl+Enter is paste & translate (window listener in app.tsx).
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
                  event.preventDefault()
                  onTranslate()
                }
              }}
              placeholder={placeholder}
            />
            <input
              ref={fileInputRef}
              class="file-input"
              type="file"
              accept="image/*,application/pdf,audio/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (!file) return
                if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                  onPdfFile(file)
                } else if (file.type.startsWith('audio/')) {
                  onAudioFile(file)
                } else {
                  onImageFile(file)
                }
              }}
            />
            <div class="input-actions">
              <button
                type="button"
                class="file-upload-button"
                onClick={() => (fileInputRef as { current: HTMLInputElement | null }).current?.click()}
                title={t('translator-add-file')}
                aria-label={t('translator-add-file')}
              >
                <FileUp size={18} />
              </button>
              {sourceText || imageInput ? (
                <button
                  type="button"
                  class="clear-input-button"
                  onClick={onClearInput}
                  title={t('translator-clear-input')}
                  aria-label={t('translator-clear-input')}
                >
                  <X size={17} />
                </button>
              ) : null}
              {canSpeakSource ? (
                <button
                  type="button"
                  class="speak-input-button"
                  onClick={() => onSpeak(sourceText, sourceSpeechLang, sourceSpeechId)}
                  title={
                    speakingId === sourceSpeechId ? t('translator-stop-reading') : t('translator-read-input-aloud')
                  }
                  aria-label={
                    speakingId === sourceSpeechId ? t('translator-stop-reading') : t('translator-read-input-aloud')
                  }
                >
                  {speechLoadingId === sourceSpeechId ? (
                    <LoaderCircle size={16} class="spin" />
                  ) : speakingId === sourceSpeechId ? (
                    <Square size={16} />
                  ) : (
                    <Volume2 size={16} />
                  )}
                </button>
              ) : null}
              {canSpeakSource && speechDownloadSupported ? (
                <button
                  type="button"
                  class="download-input-button"
                  onClick={() => onDownloadSpeech(sourceText, sourceSpeechId)}
                  title={t('translator-download-audio')}
                  aria-label={t('translator-download-audio')}
                  disabled={speechDownloadingId === sourceSpeechId}
                >
                  {speechDownloadingId === sourceSpeechId ? (
                    <LoaderCircle size={16} class="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                </button>
              ) : null}
              {micSupported ? (
                <button
                  type="button"
                  class={`mic-input-button ${isRecording ? 'recording' : ''}`}
                  onClick={onToggleRecording}
                  disabled={isTranscribing}
                  title={
                    isRecording
                      ? t('translator-stop-recording')
                      : isTranscribing
                        ? t('translator-transcribing')
                        : t('translator-record-voice')
                  }
                  aria-label={isRecording ? t('translator-stop-recording') : t('translator-record-voice')}
                >
                  {isTranscribing ? <LoaderCircle size={16} class="spin" /> : <Mic size={16} />}
                </button>
              ) : null}
              <NuancePicker nuance={nuance} onChange={onNuanceChange} />
            </div>
            {imageInput ? (
              <div class="image-chip">
                <img src={imageInput.dataUrl} alt="" />
                {isReadingImage ? <LoaderCircle size={17} class="spin" /> : <ScanText size={17} />}
                <span>{imageInput.name}</span>
                <small>{formatBytes(imageInput.size)}</small>
                <button
                  type="button"
                  class="icon-button small"
                  onClick={onClearImage}
                  title={t('translator-remove-image')}
                  aria-label={t('translator-remove-image')}
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            <span class="character-count">{t('translator-char-count', { count: sourceText.length })}</span>
          </div>
          {isRecording && liveTranscript ? (
            <p class="live-transcript" aria-live="polite">
              <Mic size={14} />
              {liveTranscript}
            </p>
          ) : null}
          <div class="submit-row">
            <div class="submit-row-lead">
              <PerformanceModeSwitch mode={performanceMode} onChange={onPerformanceModeChange} />
            </div>
            <button
              type="button"
              class={`secondary-button ${proofreadStatus === 'loading' ? 'loading' : ''}`}
              onClick={onProofread}
              disabled={!canProofread || proofreadStatus === 'loading'}
              title={providerNeedsSetup ? t('translator-setup-required-hint') : t('translator-proofread')}
            >
              {proofreadStatus === 'loading' ? <LoaderCircle size={16} /> : <PenLine size={16} />}
              {t('translator-proofread')}
            </button>
            <button
              type="button"
              class={`secondary-button ${explainStatus === 'loading' ? 'loading' : ''}`}
              onClick={onExplain}
              disabled={!canExplain || explainStatus === 'loading'}
              title={providerNeedsSetup ? t('translator-setup-required-hint') : t('translator-explain')}
            >
              {explainStatus === 'loading' ? <LoaderCircle size={16} /> : <BookOpen size={16} />}
              {t('translator-explain')}
            </button>
            <button
              type="button"
              class={`secondary-button ${exampleStatus === 'loading' ? 'loading' : ''}`}
              onClick={onExample}
              disabled={!canExample || exampleStatus === 'loading'}
              title={providerNeedsSetup ? t('translator-setup-required-hint') : t('translator-example')}
            >
              {exampleStatus === 'loading' ? <LoaderCircle size={16} /> : <NotebookText size={16} />}
              {t('translator-example')}
            </button>
            <div class="button-with-hint">
              <button
                type="button"
                class="secondary-button"
                onClick={onPasteAndTranslate}
                disabled={!canPasteAndTranslate || status === 'loading'}
                title={
                  providerNeedsSetup
                    ? t('translator-setup-required-hint')
                    : `${t('translator-paste-and-translate')} (Ctrl + Shift + Enter)`
                }
              >
                <ClipboardPaste size={16} />
                {t('translator-paste-and-translate')}
              </button>
              <span class="shortcut-hint">Ctrl + Shift + Enter</span>
            </div>
            <div class="button-with-hint">
              <button
                type="button"
                class={`primary-button ${status === 'loading' ? 'loading' : ''}`}
                onClick={status === 'loading' ? onCancelTranslate : onTranslate}
                disabled={status !== 'loading' && !canTranslate}
                title={
                  status === 'loading'
                    ? t('translator-cancel')
                    : providerNeedsSetup
                      ? t('translator-setup-required-hint')
                      : t('translator-translate')
                }
              >
                {status === 'loading' ? <Square size={17} /> : <Play size={17} />}
                {status === 'loading' ? t('translator-cancel') : t('translator-translate')}
              </button>
              <span class="shortcut-hint">Ctrl + Enter</span>
            </div>
          </div>
        </div>

        <section class={`text-pane output-pane ${hasOutput ? '' : 'output-pane-collapsed'}`} aria-live="polite">
          {mode === 'proofread' ? (
            <ProofreadOutput
              status={proofreadStatus}
              result={proofreadResult}
              copied={copiedProofread}
              onCopy={onCopyProofread}
              nativeLanguage={nativeLanguage}
              speechSupported={speechSupported}
              speakingId={speakingId}
              speechLoadingId={speechLoadingId}
              onSpeak={onSpeak}
              speechDownloadSupported={speechDownloadSupported}
              speechDownloadingId={speechDownloadingId}
              onDownloadSpeech={onDownloadSpeech}
              providerNeedsSetup={providerNeedsSetup}
              onOpenSettings={onOpenSettings}
            />
          ) : mode === 'explain' ? (
            <ExplainOutput
              status={explainStatus}
              result={explainResult}
              rubyStatus={explainRubyStatus}
              rubyTokens={explainRubyTokens}
              speechSupported={speechSupported}
              speakingId={speakingId}
              speechLoadingId={speechLoadingId}
              onSpeak={onSpeak}
              speechDownloadSupported={speechDownloadSupported}
              speechDownloadingId={speechDownloadingId}
              onDownloadSpeech={onDownloadSpeech}
              providerNeedsSetup={providerNeedsSetup}
              onOpenSettings={onOpenSettings}
            />
          ) : mode === 'example' ? (
            <ExampleOutput
              status={exampleStatus}
              result={exampleResult}
              speechSupported={speechSupported}
              speakingId={speakingId}
              speechLoadingId={speechLoadingId}
              onSpeak={onSpeak}
              speechDownloadSupported={speechDownloadSupported}
              speechDownloadingId={speechDownloadingId}
              onDownloadSpeech={onDownloadSpeech}
              providerNeedsSetup={providerNeedsSetup}
              onOpenSettings={onOpenSettings}
            />
          ) : (
            <TranslationOutput
              status={status}
              selectedHistory={selectedHistory}
              result={result}
              streamingTranslations={streamingTranslations}
              targetLanguage={targetLanguage}
              copiedTone={copiedTone}
              onCopyTranslation={onCopyTranslation}
              backTranslationStatus={backTranslationStatus}
              canCheckBackTranslation={canCheckBackTranslation}
              onCheckBackTranslation={onCheckBackTranslation}
              backTranslation={backTranslation}
              speechSupported={speechSupported}
              speakingId={speakingId}
              speechLoadingId={speechLoadingId}
              onSpeak={onSpeak}
              speechDownloadSupported={speechDownloadSupported}
              speechDownloadingId={speechDownloadingId}
              onDownloadSpeech={onDownloadSpeech}
              providerNeedsSetup={providerNeedsSetup}
              onOpenSettings={onOpenSettings}
            />
          )}
        </section>
      </div>

      {isImportingPdf ? (
        <div class="pdf-progress">
          <span class="loading-line">
            <LoaderCircle size={18} class="spin" />
            {pdfPageProgress
              ? t('translator-extracting-pdf-progress', { current: pdfPageProgress.current, total: pdfPageProgress.total })
              : t('translator-extracting-pdf')}
          </span>
          {pdfPageProgress ? (
            <div
              class="pdf-progress-bar"
              role="progressbar"
              aria-valuenow={pdfPageProgress.current}
              aria-valuemin={0}
              aria-valuemax={pdfPageProgress.total}
            >
              <div
                class="pdf-progress-bar-fill"
                style={{ width: `${(pdfPageProgress.current / pdfPageProgress.total) * 100}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {isReadingImage ? (
        <span class="loading-line">
          <LoaderCircle size={18} class="spin" />
          {t('translator-reading-image')}
        </span>
      ) : null}
      {error && <span class="error-text">{error}</span>}
      {transcriptionError && <span class="error-text">{transcriptionError}</span>}
      {pdfImportError && <span class="error-text">{pdfImportError}</span>}
      {imageImportError && <span class="error-text">{imageImportError}</span>}
    </div>
  )
}
