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
    status: 'developing',
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
      outcomes: [mkOutcome({ status: 'mastered', accuracy: 92 })],
      loading: false,
    } as never)
    render(<MasteryActionCard game="matematik" userId="u1" />)
    expect(screen.getByText(/ustalaştın/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('en zayif kazanim secilir; CTA gameStore filtrelerini kurup oyuna yonlendirir', () => {
    mockedUseMasteryMap.mockReturnValue({
      outcomes: [
        mkOutcome({ code: 'GUCLU', accuracy: 80 }),
        mkOutcome({ code: 'ZAYIF', title: 'Zayıf kazanım', accuracy: 20 }),
      ],
      loading: false,
    } as never)
    render(<MasteryActionCard game="matematik" userId="u1" />)
    // En dusuk accuracy'li (ZAYIF) kart olarak gosterilir
    expect(screen.getByText('Zayıf kazanım')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /5 Soru Çöz/ }))
    const gs = useGameStore.getState()
    expect(gs.selectedCategory).toBe('sayilar')
    expect(gs.selectedExamRef).toBe('TYT')
    expect(gs.selectedMode).toBe('practice')
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik')
  })
})
