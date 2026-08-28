import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const routeState = vi.hoisted(() => ({ game: 'wordquest' }))
const routerReplace = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({
  profile: null as { exam_type: string | null } | null,
}))
const gameState = vi.hoisted(() => ({
  selectedExamRef: 'TYT' as string | null,
  setExamRef: vi.fn(),
  setCategory: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ game: routeState.game }),
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState }))
vi.mock('@/stores/game-store', () => ({
  useGameStore: (selector: (state: typeof gameState) => unknown) => selector(gameState),
}))
vi.mock('next/dynamic', () => ({
  default: () => ({ game }: { game: string }) => <div data-testid="quiz-engine">{game}</div>,
}))

import GameClient from '../[game]/game-client'

describe('GameClient exam scope', () => {
  beforeEach(() => {
    routeState.game = 'wordquest'
    authState.profile = null
    gameState.selectedExamRef = 'TYT'
    gameState.setExamRef.mockReset()
    gameState.setCategory.mockReset()
    routerReplace.mockReset()
  })

  it.each(['TYT', 'LGS'] as const)(
    'legacy profilde onceki dersin %s filtresini Wordquest soru akisindan temizler',
    async (examRef) => {
      gameState.selectedExamRef = examRef
      render(<GameClient />)

      await waitFor(() => expect(gameState.setExamRef).toHaveBeenCalledWith(null))
      expect(routerReplace).not.toHaveBeenCalled()
    },
  )

  it('Wordquest filtresi zaten null ise gereksiz store yazimi yapmaz', async () => {
    gameState.selectedExamRef = null
    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).not.toHaveBeenCalled())
  })

  it('legacy profilde gecerli Matematik filtresini korur', async () => {
    routeState.game = 'matematik'
    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).not.toHaveBeenCalled())
  })
})
