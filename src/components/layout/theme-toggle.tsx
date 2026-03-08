'use client'

import { useEffect } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'

export function ThemeToggle() {
  const { theme, toggleTheme, setTheme } = useUIStore()

  // Sayfa yuklendiginde localStorage'dan temayı al
  useEffect(() => {
    const saved = localStorage.getItem('bilge-theme') as 'dark' | 'light' | null
    if (saved) setTheme(saved)
  }, [setTheme])

  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] transition-colors hover:bg-[var(--card)]"
      aria-label={theme === 'dark' ? 'Acik temaya gec' : 'Koyu temaya gec'}
    >
      {theme === 'dark' ? (
        <Sun size={16} className="text-[var(--reward)]" />
      ) : (
        <Moon size={16} className="text-[var(--focus)]" />
      )}
    </button>
  )
}
