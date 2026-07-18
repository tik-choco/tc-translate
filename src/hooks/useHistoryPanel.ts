import { useEffect, useState } from 'preact/hooks'
import { sendHistoryItemToLingo } from '../lib/shareToLingo'
import { publishTranslationsInbox } from '../lib/shareToStorage'
import { loadHistory, saveHistory } from '../lib/storage'
import type { TranslationHistoryItem, TranslationResult } from '../types'

// How long the "sent" confirmation state stays on a history item's Lingo
// button after a successful send, mirroring copiedTone's 1400ms window in
// useTranslationActions.ts (copyTranslation).
const sentToLingoResetDelay = 1400

export function useHistoryPanel() {
  const [showHistory, setShowHistory] = useState(true)
  const [history, setHistory] = useState<TranslationHistoryItem[]>([])
  // Id of the history item whose "send to Lingo" just succeeded, for a
  // transient checkmark on its button; cleared after sentToLingoResetDelay.
  const [sentToLingoId, setSentToLingoId] = useState('')

  // loadHistory is async (heavy fields may need a mistlib storage_get), so
  // the initial history list arrives shortly after mount rather than being
  // available synchronously.
  useEffect(() => {
    let cancelled = false
    loadHistory()
      .then((loaded) => {
        if (!cancelled) setHistory(loaded)
      })
      .catch((err) => console.warn('tc-translate: failed to load history', err))
    return () => {
      cancelled = true
    }
  }, [])

  function updateHistory(nextHistory: TranslationHistoryItem[]): void {
    setHistory(nextHistory)
    // Both are async (mistlib storage_add for the heavy fields) and
    // best-effort; failures are logged inside each function.
    saveHistory(nextHistory).catch(() => {})
    // Mirror finished translations onto the shared bus so tc-storage (and
    // other family apps on the same origin) can show them as files.
    publishTranslationsInbox(nextHistory).catch(() => {})
  }

  function updateHistoryItem(id: string, nextResult: TranslationResult): void {
    if (!id) return
    updateHistory(
      history.map((item) =>
        item.id === id
          ? {
              ...item,
              translations: nextResult.translations,
              notes: nextResult.notes,
            }
          : item,
      ),
    )
  }

  function addHistoryItem(item: TranslationHistoryItem): void {
    updateHistory([item, ...history])
  }

  // Unlike updateHistory/updateHistoryItem (which close over `history`), this
  // uses the functional setState form so late-arriving patches (e.g. explain
  // ruby tokens resolving after a newer history item was added) never clobber
  // a concurrent addition.
  function patchHistoryItem(id: string, patch: (item: TranslationHistoryItem) => TranslationHistoryItem): void {
    setHistory((current) => {
      const nextHistory = current.map((item) => (item.id === id ? patch(item) : item))
      saveHistory(nextHistory).catch(() => {})
      publishTranslationsInbox(nextHistory).catch(() => {})
      return nextHistory
    })
  }

  function deleteHistoryItem(id: string): void {
    updateHistory(history.filter((item) => item.id !== id))
  }

  // Sends one history item to tc-lingo's card inbox (see lib/shareToLingo.ts).
  // Best-effort and independent of updateHistory: this doesn't change the
  // history itself, only publishes a pointer to a sibling app. On success,
  // flips the item's button into a transient "sent" state; on failure
  // (unsupported kind, storage_add failure) it's left as-is — the failure is
  // already logged inside sendHistoryItemToLingo.
  function sendToLingo(id: string): void {
    const item = history.find((entry) => entry.id === id)
    if (!item) return
    sendHistoryItemToLingo(item)
      .then((sent) => {
        if (!sent) return
        setSentToLingoId(id)
        window.setTimeout(() => setSentToLingoId(''), sentToLingoResetDelay)
      })
      .catch(() => {})
  }

  function clearHistory(): void {
    updateHistory([])
  }

  function toggleHistory(): void {
    setShowHistory((current) => !current)
  }

  return {
    showHistory,
    history,
    updateHistory,
    updateHistoryItem,
    addHistoryItem,
    patchHistoryItem,
    deleteHistoryItem,
    clearHistory,
    toggleHistory,
    sendToLingo,
    sentToLingoId,
  }
}
