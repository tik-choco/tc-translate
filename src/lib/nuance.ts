import { intimacyLevels, maxNuanceMoods, nuanceDecorations, nuanceEmotions, nuanceMoods, nuanceStances } from '../constants'
import type { Intimacy, NuanceDecoration, NuanceEmotion, NuanceMood, NuanceStance, TranslationNuance } from '../types'

// English descriptions handed to the LLM. Kept separate from the UI labels
// (i18n) so prompt wording stays stable regardless of the UI language.
const intimacyPrompts: Record<Intimacy, string> = {
  formal: 'a superior or someone met for the first time: very polite, respectful, honorific wording',
  polite: 'an acquaintance or colleague: polite but not stiff',
  neutral: 'no particular relationship: natural default register',
  friendly: 'a friend: casual and warm',
  intimate: 'a close friend, partner, or family member: very casual and intimate',
}

const stancePrompts: Record<NuanceStance, string> = {
  humble: 'deferential and self-effacing: asks permission, puts themself down, pleads or leans on the listener',
  modest: 'modest and reserved: hedges, asks softly, does not push',
  equal: 'on equal footing',
  assertive: 'assertive and confident: states things firmly, makes direct requests',
  dominant: 'dominant with a playful, teasing edge: talks down, takes the lead, may use commands and pressing rhetorical questions',
}

const moodPrompts: Record<NuanceMood, string> = {
  soft: 'soft and mellow, not blunt',
  gentle: 'gentle, kind, and considerate',
  bright: 'bright and upbeat',
  calm: 'calm and composed',
  elegant: 'refined and graceful',
  cute: 'cute and playful',
  crisp: 'crisp and straightforward, not clingy',
  energetic: 'energetic and lively',
}

const emotionPrompts: Record<NuanceEmotion, string> = {
  happy: 'happy, cheerful',
  affectionate: 'affectionate, fond',
  grateful: 'grateful, thankful',
  apologetic: 'apologetic, sheepish',
  sad: 'sad, disappointed',
  annoyed: 'annoyed, frustrated',
  surprised: 'surprised, amazed',
  hesitant: 'hesitant, unsure',
}

/** True when any setting differs from the default, even while paused. */
export function hasNuanceSettings(nuance: TranslationNuance | null | undefined): nuance is TranslationNuance {
  return Boolean(
    nuance &&
      (nuance.intimacy !== 'neutral' ||
        nuance.stance !== 'equal' ||
        nuance.moods.length ||
        nuance.emotion ||
        nuance.decoration !== 'none'),
  )
}

/** True when the nuance should be applied to a translation (set and not paused). */
/**
 * System-prompt addition explaining the `nuance` payload (see
 * nuancePromptPayload), shared by every request that sends one: Translate and
 * the Reply tab's outgoing reply.
 */
export const nuanceInstructions =
  ' The input includes "nuance" describing how the speaker wants to come across. "relationship" is who the speaker is addressing: adjust register, politeness, honorifics, pronouns, and sentence endings to fit it. "stance" is the conversational position the speaker takes toward the listener, from deferential to dominant, independent of politeness: convey it through sentence mood (commands versus permission-seeking), assertiveness, teasing or pleading, and rhetorical questions. The grammatical form may change to fit the stance (for example a request may become a command or a humble plea), but never add insults, demands, or content that are not in the source. Stance is purely a conversational attitude and must never be given sexual connotations. With a polite relationship, keep the honorifics (a dominant stance then reads as politely condescending). "impression" is how the text should sound to the reader: express it with devices native to the target language, such as sentence-final particles and endings (for example Japanese ね/よ/かな, Korean -요/-거든요, Chinese 呢/吧/啦), softeners, hedges, and word choice; in languages without such endings (for example English), use word choice and phrasing instead. "impression" works within the politeness level the relationship sets and never drops honorifics it requires. "emotion" is the feeling the speaker wants to convey: reflect it naturally through word choice, interjections, and phrasing without adding facts or content that are not in the source. "decoration" adds expressive symbols to the translation, matching the emotion and impression: "emoji" means add one or two fitting emoji; "kaomoji" means add one fitting kaomoji (a Japanese-style text face such as (＾▽＾), (´・ω・`), or (；・∀・)) and no emoji; "both" means add one or two fitting emoji and one fitting kaomoji. Place them where they read naturally, usually at the end of a sentence. Without "decoration", do not add emoji or kaomoji that are not in the source.'

export function isNuanceActive(nuance: TranslationNuance | null | undefined): nuance is TranslationNuance {
  return hasNuanceSettings(nuance) && !nuance.paused
}

export function emojiForEmotion(emotion: NuanceEmotion | null): string {
  return nuanceEmotions.find((option) => option.id === emotion)?.emoji ?? ''
}

/** Validates an untrusted stored value; never throws. */
export function parseNuance(raw: unknown): TranslationNuance | null {
  if (raw === null || typeof raw !== 'object') return null
  const value = raw as Partial<TranslationNuance> & { addEmoji?: unknown }
  if (!intimacyLevels.includes(value.intimacy as Intimacy)) return null
  const emotion = nuanceEmotions.some((option) => option.id === value.emotion) ? (value.emotion as NuanceEmotion) : null
  const moods = Array.isArray(value.moods)
    ? [...new Set(value.moods.filter((mood): mood is NuanceMood => nuanceMoods.includes(mood)))].slice(0, maxNuanceMoods)
    : []
  const decoration: NuanceDecoration = nuanceDecorations.includes(value.decoration as NuanceDecoration)
    ? (value.decoration as NuanceDecoration)
    : value.addEmoji === true
      ? 'emoji'
      : 'none'
  const stance = nuanceStances.includes(value.stance as NuanceStance) ? (value.stance as NuanceStance) : 'equal'
  return { intimacy: value.intimacy as Intimacy, stance, moods, emotion, decoration, paused: value.paused === true }
}

/** JSON-friendly nuance for LLM payloads, or undefined when no nuance applies. */
export function nuancePromptPayload(nuance: TranslationNuance | null | undefined) {
  if (!isNuanceActive(nuance)) return undefined
  return {
    relationship: nuance.intimacy === 'neutral' ? undefined : intimacyPrompts[nuance.intimacy],
    stance: nuance.stance === 'equal' ? undefined : stancePrompts[nuance.stance],
    impression: nuance.moods.length ? nuance.moods.map((mood) => moodPrompts[mood]).join('; ') : undefined,
    emotion: nuance.emotion ? emotionPrompts[nuance.emotion] : undefined,
    decoration: nuance.decoration === 'none' ? undefined : nuance.decoration,
  }
}
