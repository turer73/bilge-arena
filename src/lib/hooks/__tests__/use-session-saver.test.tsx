import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveGameSession: vi.fn(),
  refreshProfile: vi.fn(),
  toastBadge: vi.fn(),
  toastLevelUp: vi.fn(),
  quizState: {
    answers: [{ questionId: 'q1', selectedOption: 1, isCorrect: true, timeTaken: 5, xpEarned: 15 }],
    xpEarned: 15,
    maxStreak: 1,
  },
  profile: { total_xp: 0 },
}))

vi.mock('@/lib/supabase/sessions', () => ({ saveGameSession: mocks.saveGameSession }))
vi.mock('@/lib/hooks/use-auth', () => ({ refreshProfile: mocks.refreshProfile }))
vi.mock('@/stores/quiz-store', () => ({
  useQuizStore: { getState: () => mocks.quizState },
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ profile: mocks.profile }) },
}))
vi.mock('@/lib/constants/levels', () => ({
  getLevelFromXP: () => ({ level: 1, name: 'Acemi', badge: 'seed' }),
}))
vi.mock('@/stores/toast-store', () => ({
  toast: { badge: mocks.toastBadge, levelUp: mocks.toastLevelUp },
}))

import { useSessionSaver } from '../use-session-saver'

describe('useSessionSaver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' })
    vi.stubGlobal('fetch', vi.fn())
    mocks.saveGameSession.mockResolvedValue({
      sessionId: 'session-1',
      newBadges: ['first_game', 'unknown_badge'],
    })
    mocks.refreshProfile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses session response badges for toast and does not re-post /api/badges', async () => {
    renderHook(() => useSessionSaver({
      screen: 'result',
      userId: 'u1',
      game: 'matematik',
      selectedMode: 'classic',
    }))

    await waitFor(() => expect(mocks.toastBadge).toHaveBeenCalledTimes(1))

    expect(mocks.saveGameSession).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      game: 'matematik',
      clientRequestId: '00000000-0000-4000-8000-000000000001',
    }))
    expect(mocks.toastBadge.mock.calls[0][2]).toBe(50)
    expect(fetch).not.toHaveBeenCalled()
  })
})
