import { create } from 'zustand'

export type Theme = 'dark' | 'light' | 'okyanus' | 'orman' | 'gunbatimi' | 'mor-gece'

/** Koyu arka plan kullanan temalar (logo + ikonografi için) */
export const DARK_THEMES = new Set<Theme>(['dark', 'okyanus', 'orman', 'gunbatimi', 'mor-gece'])

interface UIState {
  theme: Theme
  sidebarOpen: boolean
  setTheme: (theme: Theme) => void
  /** Geriye dönük uyumluluk: dark ↔ light arası geçiş */
  toggleTheme: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  theme: 'dark',
  sidebarOpen: false,
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('bilge-theme', theme)
    set({ theme })
  },
  toggleTheme: () => {
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('bilge-theme', next)
      return { theme: next }
    })
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))
