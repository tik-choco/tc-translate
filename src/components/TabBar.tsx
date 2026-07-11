import type { ComponentType } from 'preact'
import { memo } from 'preact/compat'

export type TabDefinition = {
  id: string
  label: string
  icon: ComponentType<{ size?: number | string }>
}

type TabBarProps = {
  tabs: TabDefinition[]
  activeId: string
  onChange: (id: string) => void
}

export const TabBar = memo(function TabBar({ tabs, activeId, onChange }: TabBarProps) {
  return (
    <nav class="tab-bar" role="tablist" aria-label="Tools">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            class={`tab-button ${active ? 'active' : ''}`}
            role="tab"
            aria-selected={active}
            aria-controls={`tab-panel-${tab.id}`}
            aria-label={tab.label}
            onClick={() => onChange(tab.id)}
          >
            <Icon size={16} />
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
})
