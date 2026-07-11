import { useState } from 'preact/hooks'
import { publishTranslationsInbox } from '../lib/shareToStorage'
import { loadHistory, saveHistory } from '../lib/storage'
import type { TranslationHistoryItem, TranslationResult } from '../types'

export function useHistoryPanel() {
  const [showHistory, setShowHistory] = useState(true)
  const [history, setHistory] = useState<TranslationHistoryItem[]>(() => loadHistory())

  function updateHistory(nextHistory: TranslationHistoryItem[]): void {
    setHistory(nextHistory)
    saveHistory(nextHistory)
    // Mirror finished translations onto the shared bus so tc-storage (and
    // other family apps on the same origin) can show them as files.
    publishTranslationsInbox(nextHistory)
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
      saveHistory(nextHistory)
      publishTranslationsInbox(nextHistory)
      return nextHistory
    })
  }

  function deleteHistoryItem(id: string): void {
    updateHistory(history.filter((item) => item.id !== id))
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
  }
}
