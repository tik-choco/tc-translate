import type { LlmProviderV1, ModelRefV1, ResolvedLlmTargetV1 } from './lib/llmConfig'
export type ProviderConnection = 'api' | 'network'
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ReasoningTask = 'default' | 'vision'
export type PerformanceMode = 'normal' | 'saver' | 'fast'
export type TaskModel = { ref?: ModelRefV1; reasoningEffort: ReasoningEffort }
export type RoomProvide = { enabled: boolean; shared: ModelRefV1[] }
export type LocalProviderSettings = {
  tasks: Record<ReasoningTask, TaskModel>
  roomProvide: Record<string, RoomProvide>
  recentModels: ModelRefV1[]
  performanceMode: PerformanceMode
}
export type ProviderSettings = LocalProviderSettings & {
  baseUrl: string
  apiKey: string
  model: string
  visionModel: string
  visionTarget: ResolvedLlmTargetV1 | null
  reasoningEffort: ReasoningEffort
  defaultReasoningEffort: ReasoningEffort
  visionReasoningEffort: ReasoningEffort
  providers: LlmProviderV1[]
  defaultModel?: ModelRefV1
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

// Optional pre-translation nuance (Translate tab): how close the speaker is
// to the recipient, the stance taken toward them, how the text should sound
// (mood), the feeling it should carry, and emoji/kaomoji decoration. The
// all-default value means "no nuance" (see lib/nuance.ts).
export type Intimacy = 'formal' | 'polite' | 'neutral' | 'friendly' | 'intimate'
export type NuanceEmotion =
  | 'happy'
  | 'affectionate'
  | 'grateful'
  | 'apologetic'
  | 'sad'
  | 'annoyed'
  | 'surprised'
  | 'hesitant'

export type NuanceMood = 'soft' | 'gentle' | 'bright' | 'calm' | 'elegant' | 'cute' | 'crisp' | 'energetic'

// Conversational position toward the listener, independent of politeness:
// deferential ("M-ish") <- 'equal' -> dominant/teasing ("S-ish").
export type NuanceStance = 'humble' | 'modest' | 'equal' | 'assertive' | 'dominant'

// Emoji and/or kaomoji (text faces like (＾▽＾)) appended to the translation.
export type NuanceDecoration = 'none' | 'emoji' | 'kaomoji' | 'both'

export type TranslationNuance = {
  intimacy: Intimacy
  // Absent in values saved before stance existed (read as 'equal').
  stance: NuanceStance
  // At most maxNuanceMoods entries; absent in values saved before moods existed.
  moods: NuanceMood[]
  emotion: NuanceEmotion | null
  // Replaced the old `addEmoji: boolean` (read as 'emoji' when true).
  decoration: NuanceDecoration
  // Temporarily off (e.g. while translating the other person's words) without
  // losing the settings above. Absent in values saved before pausing existed.
  paused: boolean
}

export type TranslationResult = {
  translations: TranslationVariant[]
  notes: string[]
  sourceText?: string
  translatedLanguage?: string
  reversed?: boolean
  // Nuance the translation was generated with; reused for later tone
  // generation and back-translation checks of the same result.
  nuance?: TranslationNuance
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
  nuance?: TranslationNuance
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
  // Small, so kept inline rather than in the bodyCid payload.
  nuance?: TranslationNuance
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
