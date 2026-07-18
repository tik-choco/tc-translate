// Sends a single translation-history entry to tc-lingo as an SRS card
// candidate, via the shared cross-app bus. Unlike shareToStorage.ts (which
// mirrors the *entire* capped history on every change, mimicking
// `ocr-markdown-index`), this topic is an explicit-send inbox: the user picks
// one history item at a time from HistoryPanel, and only that item is added.
// Payload transport follows the same "meta carries a light item list, body
// lives behind a per-item CID" shape as `translations-inbox`.
//
// Contract: topic `lingo-card-inbox` (v1). Item/payload shapes are mirrored
// in tc-lingo (src/lib/cardInbox.ts). See
// protocol/docs/data-contracts/docs/SHARED_BUS.md and
// drafts/lingo-card-inbox-v1.md.

import type { GrammarPoint, TranslationHistoryItem, TranslationVariant, VocabularyEntry } from '../types'
import { storageAddJson } from './mistStorage'
import { publishShared, readShared } from './sharedBus'

export const lingoCardInboxTopic = 'lingo-card-inbox'

// Rolling cap on the number of cards kept in the shared inbox meta. Distinct
// from `maxHistoryItems` (the local translate history cap): this list only
// grows on explicit "send to Lingo" actions, so items age out independently
// of the source history.
const lingoCardInboxMaxItems = 50

// Length cap (in characters) for the `sourcePreview` kept in `meta`, mirrors
// `buildSourcePreview` in lib/storage.ts (that one isn't exported, so this is
// a local copy of the same logic).
const sourcePreviewMaxLength = 200

function buildSourcePreview(sourceText: string): string {
  return sourceText.length > sourcePreviewMaxLength
    ? `${sourceText.slice(0, sourcePreviewMaxLength)}…`
    : sourceText
}

/** The `kind`s of history item that can become a Lingo card in v1. */
export type LingoCardSourceKind = 'translate' | 'explain'

/** CID payload: the full card material for one sent history item. */
export interface LingoCardPayloadV1 {
  v: 1
  sourceText: string
  translations: TranslationVariant[]
  /** 'explain' items only: dictionary-style entries for deterministic card mapping. */
  vocabulary?: VocabularyEntry[]
  /** 'explain' items only: grammar points, possibly with an example sentence. */
  grammarPoints?: GrammarPoint[]
  notes: string[]
}

/** One entry the consumer can list before resolving the CID payload. */
export interface LingoCardInboxItem {
  /** Stable id (the history item id); consumers dedupe imports on this. */
  id: string
  kind: LingoCardSourceKind
  targetLanguage: string
  /** Preview of the source text, for the inbox list before CID resolution. */
  sourcePreview: string
  /** `storage_add` CID for the `LingoCardPayloadV1` body. */
  cid: string
  /** ISO 8601 timestamp of this send (updated on re-send). */
  sentAt: string
}

/** `meta` payload of the `lingo-card-inbox` shared record. */
interface LingoCardInboxMeta {
  v: 1
  items: LingoCardInboxItem[]
}

function isLingoCardInboxItem(value: unknown): value is LingoCardInboxItem {
  if (value === null || typeof value !== 'object') return false
  const item = value as Partial<LingoCardInboxItem>
  return (
    typeof item.id === 'string' &&
    (item.kind === 'translate' || item.kind === 'explain') &&
    typeof item.targetLanguage === 'string' &&
    typeof item.sourcePreview === 'string' &&
    typeof item.cid === 'string' &&
    typeof item.sentAt === 'string'
  )
}

// Defensive read of the existing inbox meta: any malformed entry (unknown
// shape, tampered localStorage, an older/incompatible `v`) is dropped rather
// than throwing, since this list is other apps' (and past versions of our
// own) data, not something we own the shape of end-to-end.
function readExistingItems(): LingoCardInboxItem[] {
  const record = readShared(lingoCardInboxTopic)
  if (!record) return []
  const meta = record.meta as Partial<LingoCardInboxMeta>
  if (!Array.isArray(meta.items)) return []
  return meta.items.filter(isLingoCardInboxItem)
}

/**
 * Builds the CID payload (plus its source kind, for the inbox pointer) for a
 * history item. Returns null for kinds this topic doesn't carry in v1
 * ('proofread') or when the mode-specific result that kind needs isn't
 * present (shouldn't happen for a hydrated item that reached the history
 * list, but guarded rather than assumed).
 */
function buildLingoCard(item: TranslationHistoryItem): { kind: LingoCardSourceKind; payload: LingoCardPayloadV1 } | null {
  if (item.kind === 'translate') {
    return {
      kind: 'translate',
      payload: {
        v: 1,
        sourceText: item.sourceText,
        translations: item.translations,
        notes: item.notes,
      },
    }
  }

  if (item.kind === 'explain') {
    if (!item.explanation) return null
    return {
      kind: 'explain',
      payload: {
        v: 1,
        sourceText: item.sourceText,
        translations: [],
        vocabulary: item.explanation.vocabulary,
        grammarPoints: item.explanation.grammarPoints,
        notes: [],
      },
    }
  }

  // 'proofread': not a Lingo card source in v1 (see drafts/lingo-card-inbox-v1.md).
  return null
}

/**
 * Sends one history item to tc-lingo's card inbox: stores the full card
 * material via mistlib storage_add, then merges a light pointer into the
 * shared `lingo-card-inbox` meta (replacing any prior send of the same item,
 * moved to the front, rolling-capped at `lingoCardInboxMaxItems`). Returns
 * whether the send succeeded — false if the item's kind isn't supported yet,
 * its mode-specific result is missing, or the storage_add itself failed (in
 * which case nothing is published, so the existing inbox is left untouched).
 */
export async function sendHistoryItemToLingo(item: TranslationHistoryItem): Promise<boolean> {
  const card = buildLingoCard(item)
  if (!card) return false

  let cid: string
  try {
    cid = await storageAddJson(`${item.id}.tc-lingo-card.json`, card.payload)
  } catch (err) {
    console.warn('tc-translate: failed to store lingo card payload', item.id, err)
    return false
  }

  const inboxItem: LingoCardInboxItem = {
    id: item.id,
    kind: card.kind,
    targetLanguage: item.targetLanguage,
    sourcePreview: buildSourcePreview(item.sourceText),
    cid,
    sentAt: new Date().toISOString(),
  }

  const existing = readExistingItems().filter((existingItem) => existingItem.id !== item.id)
  const items = [inboxItem, ...existing].slice(0, lingoCardInboxMaxItems)
  const meta: LingoCardInboxMeta = { v: 1, items }
  publishShared(lingoCardInboxTopic, '', meta as unknown as Record<string, unknown>)
  return true
}
