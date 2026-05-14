'use client'

import { create } from 'zustand'
import type { GameSlug } from '@/lib/constants/games'

interface GameStore {
  selectedGame: GameSlug | null
  selectedMode: string
  selectedCategory: string | null
  selectedDifficulty: number | null
  /** null = tümü, 'TYT', 'LGS' */
  selectedExamRef: string | null

  setGame: (game: GameSlug) => void
  setMode: (mode: string) => void
  setCategory: (category: string | null) => void
  setDifficulty: (difficulty: number | null) => void
  setExamRef: (examRef: string | null) => void
  resetFilters: () => void
}

export const useGameStore = create<GameStore>((set) => ({
  selectedGame: null,
  selectedMode: 'classic',
  selectedCategory: null,
  selectedDifficulty: null,
  selectedExamRef: null,

  setGame: (game) => set({ selectedGame: game }),
  setMode: (mode) => set({ selectedMode: mode }),
  setCategory: (category) => set({ selectedCategory: category }),
  setDifficulty: (difficulty) => set({ selectedDifficulty: difficulty }),
  setExamRef: (examRef) => set({ selectedExamRef: examRef }),
  resetFilters: () => set({
    selectedCategory: null,
    selectedDifficulty: null,
    selectedMode: 'classic',
    selectedExamRef: null,
  }),
}))
