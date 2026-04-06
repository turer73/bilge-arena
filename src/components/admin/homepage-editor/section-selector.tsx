'use client'

import { useHomepageEditorStore } from '@/stores/homepage-editor-store'
import type { HomepageSection } from '@/types/database'
import { cn } from '@/lib/utils/cn'

const SECTIONS: { key: HomepageSection; icon: string; label: string }[] = [
  { key: 'hero', icon: '🏠', label: 'Hero' },
  { key: 'stats', icon: '📊', label: 'İstatistikler' },
  { key: 'games', icon: '🎮', label: 'Oyunlar' },
  { key: 'how_it_works', icon: '📖', label: 'Nasıl Çalışır' },
  { key: 'cta', icon: '🚀', label: 'Harekete Geç' },
  { key: 'leaderboard', icon: '🏆', label: 'Sıralama' },
  { key: 'footer', icon: '📋', label: 'Alt Bilgi' },
]

export function SectionSelector() {
  const activeSection = useHomepageEditorStore((s) => s.activeSection)
  const setActiveSection = useHomepageEditorStore((s) => s.setActiveSection)

  return (
    <nav className="flex flex-col gap-1 w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--surface)] p-3 rounded-l-2xl">
      <h3 className="font-display text-sm font-bold text-[var(--text-sub)] uppercase tracking-wider mb-2 px-2">
        Bölümler
      </h3>
      {SECTIONS.map((section) => {
        const isActive = activeSection === section.key
        return (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-left',
              isActive
                ? 'bg-[var(--focus-bg)] text-[var(--focus)] border border-[var(--focus-border)] shadow-sm'
                : 'text-[var(--text-sub)] hover:bg-[var(--bg)] hover:text-[var(--text)]'
            )}
          >
            <span className="text-lg">{section.icon}</span>
            <span>{section.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
