import { ChevronDown, Search } from 'lucide-preact'
import type { Ref } from 'preact'
import { memo } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  languageChineseSimplifiedNames,
  languageChineseTraditionalNames,
  languageJapaneseNames,
  languageNativeNames,
  languageOptions,
} from '../constants'
import { t } from '../i18n'
import { languageDisplayName } from '../lib/language'

const recentTargetLanguagesKey = 'tc-translate-recent-target-languages-v1'
const maxRecentLanguages = 5

function loadRecentTargets(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(recentTargetLanguagesKey) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && languageOptions.includes(item))
      .slice(0, maxRecentLanguages)
  } catch {
    return []
  }
}

type LanguageSelectProps = {
  containerRef: Ref<HTMLDivElement>
  open: boolean
  setOpen: (value: boolean | ((current: boolean) => boolean)) => void
  targetLanguage: string
  onTargetLanguageChange: (language: string) => void
}

// Target-language picker. The native language moved to the settings modal:
// it rarely changes, and listing 25 languages twice made the menu unwieldy.
export const LanguageSelect = memo(function LanguageSelect({
  containerRef,
  open,
  setOpen,
  targetLanguage,
  onTargetLanguageChange,
}: LanguageSelectProps) {
  const [query, setQuery] = useState('')
  const [recentTargets, setRecentTargets] = useState<string[]>(loadRecentTargets)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    searchRef.current?.focus()
  }, [open])

  const normalizedQuery = query.trim().toLowerCase()

  function matchesQuery(language: string): boolean {
    if (!normalizedQuery) return true
    return (
      language.toLowerCase().includes(normalizedQuery) ||
      (languageNativeNames[language] ?? '').toLowerCase().includes(normalizedQuery) ||
      (languageJapaneseNames[language] ?? '').includes(query.trim()) ||
      (languageChineseSimplifiedNames[language] ?? '').includes(query.trim()) ||
      (languageChineseTraditionalNames[language] ?? '').includes(query.trim())
    )
  }

  const filtered = languageOptions.filter(matchesQuery)
  const visibleRecents = normalizedQuery ? [] : recentTargets

  function selectTarget(language: string): void {
    const nextRecents = [language, ...recentTargets.filter((item) => item !== language)].slice(
      0,
      maxRecentLanguages,
    )
    setRecentTargets(nextRecents)
    try {
      localStorage.setItem(recentTargetLanguagesKey, JSON.stringify(nextRecents))
    } catch {
      // Persisting recents is best-effort.
    }
    onTargetLanguageChange(language)
    setOpen(false)
  }

  function renderLanguageLabel(language: string) {
    const name = languageDisplayName(language)
    const native = languageNativeNames[language]
    return (
      <>
        <span class="language-name">{name}</span>
        {native && native !== name ? <span class="language-native">{native}</span> : null}
      </>
    )
  }

  function renderOption(language: string, keyPrefix = '') {
    return (
      <button
        type="button"
        key={`${keyPrefix}${language}`}
        class={language === targetLanguage ? 'current' : ''}
        role="option"
        aria-selected={language === targetLanguage}
        onClick={() => selectTarget(language)}
      >
        {renderLanguageLabel(language)}
      </button>
    )
  }

  return (
    <div
      class="language-select header-language"
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        class={`language-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{languageDisplayName(targetLanguage)}</span>
        <ChevronDown size={18} />
      </button>
      {open ? (
        <div class="language-menu" role="listbox" aria-label={t('translator-target-language-aria')}>
          <div class="language-search">
            <Search size={15} />
            <input
              ref={searchRef}
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filtered.length > 0) {
                  event.preventDefault()
                  selectTarget(filtered[0])
                } else if (event.key === 'Escape') {
                  setOpen(false)
                }
              }}
              placeholder={t('translator-search-languages')}
              aria-label={t('translator-search-languages')}
            />
          </div>
          {visibleRecents.length > 0 ? (
            <>
              <div class="language-menu-section">
                <span>{t('translator-recent-label')}</span>
              </div>
              {visibleRecents.map((language) => renderOption(language, 'recent-'))}
              <div class="language-menu-section">
                <span>{t('translator-target-label')}</span>
              </div>
            </>
          ) : null}
          {filtered.map((language) => renderOption(language))}
          {filtered.length === 0 ? <p class="language-menu-empty">{t('translator-no-language-match')}</p> : null}
        </div>
      ) : null}
    </div>
  )
})
