import type { LlmProviderV1, ModelPresetV1 } from './lib/llmConfig'

export type ProviderConnection = 'api' | 'network'

// reasoning_effort values offered per task. 'none' is a real API value
// (explicitly disables reasoning on servers that support it), not "omit the
// field" — requests always include reasoning_effort, 'none' included.
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high'

export type ReasoningTask = 'default' | 'vision'

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
  /**
   * Ids of presets (in the shared llm config) shared to the LLM Network when
   * networkProviderEnabled; their labels (falling back to model ids, see
   * advertisedModelName in lib/networkModels.ts) are advertised via
   * provider_hello.models, and incoming requests naming one route to the
   * matching preset's connection.
   */
  networkProviderPresetIds: string[]
  /** Per-task reasoning_effort, always sent with the request (default 'none'). */
  defaultReasoningEffort: ReasoningEffort
  visionReasoningEffort: ReasoningEffort
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
  /** reasoning_effort for default-task requests. Always sent to the API, 'none' included. */
  reasoningEffort: ReasoningEffort
  visionReasoningEffort: ReasoningEffort
  connection: ProviderConnection
  roomId: string
  networkProviderEnabled: boolean
  visionPresetId: string
  /**
   * Ids of presets (in the shared llm config) shared to the LLM Network when
   * networkProviderEnabled; their labels (falling back to model ids, see
   * advertisedModelName in lib/networkModels.ts) are advertised via
   * provider_hello.models, and incoming requests naming one route to the
   * matching preset's connection.
   */
  networkProviderPresetIds: string[]
  /** Every connection/preset in the shared llm config, for the Settings UI's connection/preset management lists and pickers. */
  providers: LlmProviderV1[]
  presets: ModelPresetV1[]
  defaultPresetId: string
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

// Runtime TTS settings: the shared config's `tts` field, with `engine`
// DERIVED (not app-local/stored) via deriveVoiceEngine in lib/voice.ts - an
// unset/blank `model` means 'browser'; otherwise it reflects whether the
// resolved provider is a Network room or a plain API endpoint. `providerId`
// absent means "same provider as the default LLM preset" (see resolveVoice
// in lib/llmConfig.ts).
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

// Same union as VoiceEngine; kept as a separate name since call sites
// (useTranscription, useSttSegments, ...) refer to the STT engine by this type.
export type SttEngine = VoiceEngine

// App-local STT settings persisted at `tc-translate-stt-settings-v1`. Only
// mic selection stays app-local; model/provider live in the shared config's
// `stt` field and engine is DERIVED (see lib/voice.ts deriveVoiceEngine), not
// stored here.
export type LocalSttSettings = {
  /** Preferred audio input deviceId; empty string means the system default. */
  micDeviceId: string
}

// Runtime STT settings: `LocalSttSettings` merged with the shared config's
// `stt` field, with `engine` DERIVED (not app-local/stored) via
// deriveVoiceEngine in lib/voice.ts - an unset/blank `model` means 'browser';
// otherwise it reflects whether the resolved provider is a Network room or a
// plain API endpoint. `providerId` absent means "same provider as the
// default LLM preset" (see resolveVoice in lib/llmConfig.ts).
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

export type HistoryKind = 'translate' | 'proofread' | 'explain' | 'example' | 'reply'

// Reply tab: sourceText holds the received message (partnerMessage); this
// carries the rest of what was translated in response to it.
export type ReplyResult = {
  ownReply: string
  detectedLanguage: string
  translatedReply: string
}

// One history entry, covering every kind. `kind` is backfilled to
// 'translate' when loading pre-`kind` localStorage data (see lib/storage.ts).
// For 'proofread'/'explain'/'example'/'reply' items `targetLanguage` is '' and
// `translations`/`notes` are empty; the mode-specific payload lives in
// `proofread` / `explanation` / `example` / `reply` respectively.
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
  example?: ExampleResult
  reply?: ReplyResult
}

// The heavy per-item fields (full source text, translations, proofread/
// explain/example/reply results), stored via mistlib storage_add and
// referenced from a `PersistedHistoryItem.bodyCid` instead of living inline
// in localStorage.
export type HistoryItemBody = {
  sourceText: string
  translations: TranslationVariant[]
  proofread?: ProofreadResult
  explanation?: ExplanationResult
  example?: ExampleResult
  reply?: ReplyResult
}

// Shape of a history item as persisted at `tc-translate-history-v1`. New
// saves always carry `bodyCid` (see lib/storage.ts) plus a small
// `sourcePreview`; entries written before this migration instead carry the
// full fields inline (`sourceText`/`translations`/`proofread`/`explanation`/
// `example`/`reply`) with no `bodyCid`. Dual-read: prefer `bodyCid` when
// present, else fall back to the inline legacy fields.
export type PersistedHistoryItem = {
  id: string
  createdAt: number
  kind: HistoryKind
  targetLanguage: string
  notes: string[]
  sourcePreview: string
  bodyCid?: string
  // Legacy inline fields (pre-migration), read-only fallback.
  sourceText?: string
  translations?: TranslationVariant[]
  proofread?: ProofreadResult
  explanation?: ExplanationResult
  example?: ExampleResult
  reply?: ReplyResult
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

export type ExampleSentence = {
  text: string
  reading?: string
  translation?: string
}

export type ExampleResult = {
  sentences: ExampleSentence[]
}

export type AppMode = 'translate' | 'proofread' | 'explain' | 'example'
