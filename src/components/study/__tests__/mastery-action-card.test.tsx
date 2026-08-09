/**
 * MasteryActionCard — aksiyon-odaklı mastery kartı (en-zayıf kazanım + pratik CTA).
 * Codecov patch-coverage: PR#278 review turu (dallar: bos / hepsi-mastered / CTA-akisi).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MasteryActionCard } from '../mastery-action-card'
import { useMasteryMap, type MasteryOutcome } from '@/lib/hooks/use-mastery-map'
import { useGameStore } from '@/stores/game-store'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/lib/hooks/use-mastery-map', () => ({
  useMasteryMap: vi.fn(),
}))

const mockedUseMasteryMap = vi.mocked(useMasteryMap)

function mkOutcome(overrides: Partial<MasteryOutcome> = {}): MasteryOutcome {
  return {
    code: 'MAT-SAY-01',
    nodeCode: 'ba-tyt-math-v1:outcome:sayilar',
    path: ['TYT Matematik', 'Sayılar ve Cebir', 'Sayılar', 'Sayılar ve işlem'],
    title: 'Sayılar ve işlem becerisi (pilot)',
    description: null,
    game: 'matematik',
    category: 'sayilar',
    examRef: 'TYT',
    attempts: 6,
    correctAttempts: 3,
    weightedEarned: 3,
    weightedPossible: 6,
    delayedCorrect: 0,
    accuracy: 50,
    rawAccuracy: 50,
    difficultyAccuracy: 50,
    averageTimeSec: 12,
    fastWrongRate: 20,
    hintRate: 0,
    averageHintStage: null,
    guessRisk: 0,
    carelessRisk: 0,
    evidenceCompleteness: 100,
    score: 50,
    status: 'developing',
    modelVersion: 'evidence-v2',
    components: { accuracy: 28, delayedRetrieval: 0, independence: 15, selfRegulation: 7 },
    lastAnsweredAt: null,
    ...overrides,
  }
}

describe('MasteryActionCard', () => {
  beforeEach(() => {
    pushMock.mockClear()
    mockedUseMasteryMap.mockReset()
  })

  test('userId yok / loading / outcome bos ise render etmez', () => {
    mockedUseMasteryMap.mockReturnValue({ outcomes: [], loading: false } as never)
    const { container } = render(<MasteryActionCard game="matematik" userId="u1" />)
    expect(container.innerHTML).toBe('')
  })

  test('tum kazanimlar mastered ise kutlama mesaji gosterir (CTA yok)', () => {
    mockedUseMasteryMap.mockReturnValue({
      outcomes: [mkOutcome({ status: 'mastered', accuracy: 92, score: 92 })],
      loading: false,
    } as never)
    render(<MasteryActionCard game="matematik" userId="u1" />)
    expect(screen.getByText(/ustalaştın/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('en zayif kazanim secilir; CTA gameStore filtrelerini kurup oyuna yonlendirir', () => {
    mockedUseMasteryMap.mockReturnValue({
      outcomes: [
        mkOutcome({ code: 'GUCLU', accuracy: 80, score: 80 }),
        mkOutcome({ code: 'ZAYIF', title: 'Zayıf kazanım', accuracy: 20, score: 20 }),
      ],
      loading: false,
    } as never)
    render(<MasteryActionCard game="matematik" userId="u1" />)
    // En dusuk birleşik skorlu (ZAYIF) kart olarak gösterilir.
    expect(screen.getByText('Zayıf kazanım')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tüm hâkimiyet haritasını aç/i })).toHaveAttribute(
      'href',
      '/arena/hakimiyet?game=matematik',
    )

    fireEvent.click(screen.getByRole('button', { name: /Bu kazanımı çalış/ }))
    const gs = useGameStore.getState()
    expect(gs.selectedCategory).toBe('sayilar')
    expect(gs.selectedExamRef).toBe('TYT')
    expect(gs.selectedMode).toBe('practice')
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik')
  })
})
