export type ProviderConnection = 'api' | 'network'

// App-local settings persisted at `tc-translate-provider-settings-v1`.
// Connection details (baseUrl/apiKey/model/temperature) now live in the
// shared `tc-shared-llm-config-v1` key (see lib/llmConfig.ts) so they can be
// reused by other same-origin tik-choco apps; this type keeps only what's
// specific to tc-translate itself.
export type LocalProviderSettings = {
  connection: ProviderConnection
  /**
   * Participate as an LLM Network provider, forwarding llm_request traffic
   * received in `roomId` to this upstream (Base URL / API key / model).
   * Independent of `connection`: a user can consume via direct API while
   * also providing Network service to others.
   */
  networkProviderEnabled: boolean
  /**
   * Id of the preset (in the shared llm config) used for OCR/vision calls.
   * '' means "use the default preset's model for vision too".
   */
  visionPresetId: string
}

// Runtime settings used throughout the app: `LocalProviderSettings` merged
// with the resolved default preset/provider (and, for `visionModel`, the
// vision preset) from the shared llm config. Kept in this pre-migration
// shape so the call sites built around it (lib/llm.ts, lib/api.ts, most
// hooks) don't need to change; only how it's constructed/persisted changed.
export type ProviderSettings = {
  baseUrl: string
  apiKey: string
  model: string
  visionModel: string
  temperature: number
  /** From the resolved default preset, if it set one; falls back to 'none' at call sites. */
  reasoningEffort?: string
  connection: ProviderConnection
  roomId: string
  networkProviderEnabled: boolean
  visionPresetId: string
}

// Shape of the pre-migration `tc-translate-provider-settings-v1`, kept only
// to migrate old localStorage data into the shared llm config.
export type LegacyProviderSettings = {
  baseUrl: string
  apiKey: string
  model: string
  visionModel: string
  temperature: number
  connection: ProviderConnection
  roomId: string
  networkProviderEnabled: boolean
}

export type VoiceEngine = 'browser' | 'api' | 'network'

// App-local TTS settings persisted at `tc-translate-tts-settings-v1`. The
// model/voice/provider now live in the shared config's `tts` field; only the
// engine choice (browser vs. API vs. Network) is app-local.
export type LocalTtsSettings = {
  engine: VoiceEngine
}

// Runtime TTS settings: `LocalTtsSettings.engine` merged with the shared
// config's `tts` field. `providerId` absent means "same provider as the
// default LLM preset" (see resolveVoice in lib/llmConfig.ts).
export type TtsSettings = {
  engine: VoiceEngine
  providerId?: string
  model: string
  voice: string
}

// Shape of the pre-migration `tc-translate-tts-settings-v1`.
export type LegacyTtsSettings = {
  baseUrl: string
  apiKey: string
  model: string
  voice: string
  engine: VoiceEngine
}

export type SttEngine = 'api' | 'network'

// App-local STT settings persisted at `tc-translate-stt-settings-v1`. The
// model/provider now live in the shared config's `stt` field; engine and mic
// selection stay app-local.
export type LocalSttSettings = {
  engine: SttEngine
  /** Preferred audio input deviceId; empty string means the system default. */
  micDeviceId: string
}

// Runtime STT settings: `LocalSttSettings` merged with the shared config's
// `stt` field. `providerId` absent means "same provider as the default LLM
// preset" (see resolveVoice in lib/llmConfig.ts).
export type SttSettings = {
  engine: SttEngine
  micDeviceId: string
  providerId?: string
  model: string
}

// Shape of the pre-migration `tc-translate-stt-settings-v1`.
export type LegacySttSettings = {
  baseUrl: string
  apiKey: string
  model: string
  engine: SttEngine
  micDeviceId: string
}

// Shape of the pre-split voice settings, kept only to migrate old localStorage data.
export type LegacyVoiceSettings = {
  baseUrl: string
  apiKey: string
  ttsModel: string
  sttModel: string
  ttsVoice: string
  engine: VoiceEngine
}

export type TranslationResult = {
  translations: TranslationVariant[]
  notes: string[]
  sourceText?: string
  translatedLanguage?: string
  reversed?: boolean
}

export type TranslationVariant = {
  tone: string
  text: string
  pinyin?: string
  reading?: string
}

export type HistoryKind = 'translate' | 'proofread' | 'explain'

// One history entry, covering all three modes. `kind` is backfilled to
// 'translate' when loading pre-`kind` localStorage data (see lib/storage.ts).
// For 'proofread'/'explain' items `targetLanguage` is '' and `translations`/
// `notes` are empty; the mode-specific payload lives in `proofread` /
// `explanation` respectively.
export type TranslationHistoryItem = {
  id: string
  createdAt: number
  kind: HistoryKind
  sourceText: string
  targetLanguage: string
  translations: TranslationVariant[]
  notes: string[]
  proofread?: ProofreadResult
  explanation?: ExplanationResult
}

export type Status = 'idle' | 'loading' | 'done' | 'error'
export type ModelStatus = 'idle' | 'loading' | 'done' | 'error'

export type ImageInput = {
  name: string
  dataUrl: string
  size: number
}

export type BackTranslationItem = {
  tone: string
  text: string
  verdict: string
  issues: string[]
}

export type BackTranslationCheck = {
  checks: BackTranslationItem[]
  summary: string
  issues: string[]
}

export type ProofreadCorrection = {
  before: string
  after: string
  reason: string
}

export type ProofreadResult = {
  correctedText: string
  corrections: ProofreadCorrection[]
  summary: string
}

export type ExplanationRubyToken = {
  text: string
  reading?: string
}

export type GrammarPoint = {
  pattern: string
  explanation: string
  example?: string
}

export type VocabularyEntry = {
  word: string
  reading?: string
  meaning: string
  note?: string
}

export type ExplanationResult = {
  overview: string
  rubyTokens: ExplanationRubyToken[]
  grammarPoints: GrammarPoint[]
  vocabulary: VocabularyEntry[]
}

export type AppMode = 'translate' | 'proofread' | 'explain'
