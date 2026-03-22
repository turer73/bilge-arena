import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from '../game-store'

describe('game-store', () => {
  beforeEach(() => {
    useGameStore.setState({
      selectedGame: null,
      selectedMode: 'classic',
      selectedCategory: null,
      selectedDifficulty: null,
    })
  })

  it('baslangic durumu dogru olmali', () => {
    const s = useGameStore.getState()
    expect(s.selectedGame).toBeNull()
    expect(s.selectedMode).toBe('classic')
    expect(s.selectedCategory).toBeNull()
    expect(s.selectedDifficulty).toBeNull()
  })

  it('setGame oyun secmeli', () => {
    useGameStore.getState().setGame('matematik')
    expect(useGameStore.getState().selectedGame).toBe('matematik')
  })

  it('setMode modu degistirmeli', () => {
    useGameStore.getState().setMode('blitz')
    expect(useGameStore.getState().selectedMode).toBe('blitz')
  })

  it('setCategory kategori secmeli', () => {
    useGameStore.getState().setCategory('aritmetik')
    expect(useGameStore.getState().selectedCategory).toBe('aritmetik')
  })

  it('setDifficulty zorluk secmeli', () => {
    useGameStore.getState().setDifficulty(3)
    expect(useGameStore.getState().selectedDifficulty).toBe(3)
  })

  it('resetFilters filtreleri sifirlamali ama oyunu korumali', () => {
    useGameStore.getState().setGame('fen')
    useGameStore.getState().setMode('marathon')
    useGameStore.getState().setCategory('fizik')
    useGameStore.getState().setDifficulty(4)

    useGameStore.getState().resetFilters()

    const s = useGameStore.getState()
    expect(s.selectedGame).toBe('fen') // oyun korunmali
    expect(s.selectedMode).toBe('classic') // varsayilana donmeli
    expect(s.selectedCategory).toBeNull()
    expect(s.selectedDifficulty).toBeNull()
  })
})
