'use client'

import { create } from 'zustand'
import type { GameSlug } from '@/lib/constants/games'

interface GameStore {
  selectedGame: GameSlug | null
  selectedMode: string
  selectedCategory: string | null
  selectedDifficulty: number | null

  setGame: (game: GameSlug) => void
  setMode: (mode: string) => void
  setCategory: (category: string | null) => void
  setDifficulty: (difficulty: number | null) => void
  resetFilters: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  selectedGame: null,
  selectedMode: 'classic',
  selectedCategory: null,
  selectedDifficulty: null,

  setGame: (game) => set({ selectedGame: game }),
  setMode: (mode) => set({ selectedMode: mode }),
  setCategory: (category) => set({ selectedCategory: category }),
  setDifficulty: (difficulty) => set({ selectedDifficulty: difficulty }),
  resetFilters: () => set({
    selectedCategory: null,
    selectedDifficulty: null,
    selectedMode: 'classic',
  }),
}))
