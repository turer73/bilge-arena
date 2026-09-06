import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
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

const ATTEMPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('useSessionSaver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveGameSession.mockReset()
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' })
    vi.stubGlobal('fetch', vi.fn())
    mocks.saveGameSession.mockResolvedValue({
      sessionId: 'session-1',
      totalXP: 15,
      correctCount: 1,
      wrongCount: 0,
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
      attemptId: ATTEMPT_ID,
      game: 'matematik',
      selectedMode: 'classic',
    }))

    await waitFor(() => expect(mocks.toastBadge).toHaveBeenCalledTimes(1))

    expect(mocks.saveGameSession).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      attemptId: ATTEMPT_ID,
      game: 'matematik',
      clientRequestId: '00000000-0000-4000-8000-000000000001',
    }))
    expect(mocks.toastBadge.mock.calls[0][2]).toBe(50)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not consume idempotency or save before an attempt ticket exists', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000001')
    vi.stubGlobal('crypto', { randomUUID })

    renderHook(() => useSessionSaver({
      screen: 'result',
      userId: 'u1',
      attemptId: null,
      game: 'matematik',
      selectedMode: 'classic',
    }))

    expect(mocks.saveGameSession).not.toHaveBeenCalled()
    expect(randomUUID).not.toHaveBeenCalled()
  })

  it('exposes pending then saved and keeps canonical server totalXP', async () => {
    let resolveSave!: (value: unknown) => void
    mocks.saveGameSession.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const { result } = renderHook(() => useSessionSaver({
      screen: 'result', userId: 'u1', attemptId: ATTEMPT_ID,
      game: 'matematik', selectedMode: 'classic',
    }))

    await waitFor(() => expect(result.current.saveStatus).toBe('pending'))
    expect(result.current.savedSession).toBeNull()
    resolveSave({ sessionId: 'session-1', totalXP: 7, correctCount: 1, wrongCount: 0, newBadges: [] })
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'))
    expect(result.current.savedSession?.totalXP).toBe(7)
  })

  it('keeps saved after a post-commit profile refresh failure', async () => {
    mocks.refreshProfile.mockRejectedValueOnce(new Error('profile refresh failed'))
    const { result } = renderHook(() => useSessionSaver({
      screen: 'result', userId: 'u1', attemptId: ATTEMPT_ID,
      game: 'matematik', selectedMode: 'classic',
    }))

    await waitFor(() => expect(result.current.saveStatus).toBe('saved'))
    expect(result.current.savedSession?.totalXP).toBe(15)
  })

  it('keeps saved after a post-commit consumer callback throws', async () => {
    const { result } = renderHook(() => useSessionSaver({
      screen: 'result', userId: 'u1', attemptId: ATTEMPT_ID,
      game: 'matematik', selectedMode: 'classic', onSessionSaved: () => { throw new Error('consumer failed') },
    }))

    await waitFor(() => expect(result.current.saveStatus).toBe('saved'))
    expect(result.current.savedSession?.totalXP).toBe(15)
  })

  it('does not submit twice under StrictMode', async () => {
    let resolveSave!: (value: unknown) => void
    mocks.saveGameSession.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const { result } = renderHook(() => useSessionSaver({
      screen: 'result', userId: 'u1', attemptId: ATTEMPT_ID,
      game: 'matematik', selectedMode: 'classic',
    }), { wrapper: StrictMode })
    await waitFor(() => expect(mocks.saveGameSession).toHaveBeenCalledOnce())
    expect(result.current.saveStatus).toBe('pending')
    resolveSave({ sessionId: 'session-1', totalXP: 15, correctCount: 1, wrongCount: 0, newBadges: [] })
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'))
    expect(mocks.saveGameSession).toHaveBeenCalledOnce()
  })

  it('does not update state after unmount when save resolves late', async () => {
    let resolveSave!: (value: unknown) => void
    const onSessionSaved = vi.fn()
    mocks.saveGameSession.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const { unmount } = renderHook(() => useSessionSaver({
      screen: 'result', userId: 'u1', attemptId: ATTEMPT_ID,
      game: 'matematik', selectedMode: 'classic',
      onSessionSaved,
    }))
    await waitFor(() => expect(mocks.saveGameSession).toHaveBeenCalledOnce())
    unmount()
    resolveSave({ sessionId: 'late', totalXP: 1, correctCount: 1, wrongCount: 0, newBadges: [] })
    await Promise.resolve()
    await Promise.resolve()
    expect(onSessionSaved).not.toHaveBeenCalled()
    expect(mocks.refreshProfile).not.toHaveBeenCalled()
    expect(mocks.toastBadge).not.toHaveBeenCalled()
    expect(mocks.toastLevelUp).not.toHaveBeenCalled()
  })

  it.each([
    ['null', () => Promise.resolve(null)],
    ['reject', () => Promise.reject(new Error('rpc failed'))],
  ])('reports %s save as failed without retrying', async (_label, outcome) => {
    mocks.saveGameSession.mockImplementationOnce(outcome)
    const { result } = renderHook(() => useSessionSaver({
      screen: 'result', userId: 'u1', attemptId: ATTEMPT_ID,
      game: 'matematik', selectedMode: 'classic',
    }))

    await waitFor(() => expect(result.current.saveStatus).toBe('failed'))
    expect(mocks.saveGameSession).toHaveBeenCalledOnce()
  })

  it('marks guest and missing-ticket results as not_applicable', () => {
    const { result } = renderHook(() => useSessionSaver({
      screen: 'result', userId: undefined, attemptId: null,
      game: 'matematik', selectedMode: 'classic',
    }))
    expect(result.current.saveStatus).toBe('not_applicable')
    expect(mocks.saveGameSession).not.toHaveBeenCalled()
  })

  it('ignores a late response from an older user/attempt context', async () => {
    let resolveOld!: (value: unknown) => void
    mocks.saveGameSession
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce({ sessionId: 'session-2', totalXP: 22, correctCount: 1, wrongCount: 0, newBadges: [] })
    const { result, rerender } = renderHook(
      ({ userId, attemptId }) => useSessionSaver({
        screen: 'result', userId, attemptId, game: 'matematik', selectedMode: 'classic',
      }),
      { initialProps: { userId: 'u1', attemptId: ATTEMPT_ID } },
    )

    await waitFor(() => expect(mocks.saveGameSession).toHaveBeenCalledOnce())
    rerender({ userId: 'u2', attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    await waitFor(() => expect(mocks.saveGameSession).toHaveBeenCalledTimes(2))
    resolveOld({ sessionId: 'session-1', totalXP: 1, correctCount: 1, wrongCount: 0, newBadges: [] })
    await Promise.resolve()
    expect(result.current.savedSession?.sessionId).not.toBe('session-1')
    await waitFor(() => expect(result.current.savedSession?.sessionId).toBe('session-2'))
  })

  it('does not run old post-commit effects after a context switch during refresh', async () => {
    let resolveRefresh!: () => void
    const onSessionSaved = vi.fn()
    mocks.saveGameSession
      .mockResolvedValueOnce({ sessionId: 'session-1', totalXP: 15, correctCount: 1, wrongCount: 0, newBadges: [] })
      .mockResolvedValueOnce({ sessionId: 'session-2', totalXP: 22, correctCount: 1, wrongCount: 0, newBadges: [] })
    mocks.refreshProfile
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveRefresh = resolve }))
      .mockResolvedValue(undefined)
    const { result, rerender } = renderHook(
      ({ userId, attemptId }) => useSessionSaver({
        screen: 'result', userId, attemptId, game: 'matematik', selectedMode: 'classic', onSessionSaved,
      }),
      { initialProps: { userId: 'u1', attemptId: ATTEMPT_ID } },
    )

    await waitFor(() => expect(mocks.refreshProfile).toHaveBeenCalledOnce())
    rerender({ userId: 'u2', attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    await waitFor(() => expect(result.current.savedSession?.sessionId).toBe('session-2'))
    resolveRefresh()
    await Promise.resolve()
    expect(onSessionSaved).toHaveBeenCalledOnce()
    expect(onSessionSaved.mock.calls[0][0]).toEqual(expect.objectContaining({ game: 'matematik' }))
  })

  it('ignores an old A response after context A to B to A even though the key matches again', async () => {
    let resolveOld!: (value: unknown) => void
    const onSessionSaved = vi.fn()
    mocks.saveGameSession
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValueOnce({ sessionId: 'session-b', totalXP: 22, correctCount: 1, wrongCount: 0, newBadges: [] })
      .mockResolvedValueOnce({ sessionId: 'session-new-a', totalXP: 33, correctCount: 1, wrongCount: 0, newBadges: [] })
    const a = { userId: 'u1', attemptId: ATTEMPT_ID }
    const { result, rerender } = renderHook(
      ({ userId, attemptId }) => useSessionSaver({
        screen: 'result', userId, attemptId, game: 'matematik', selectedMode: 'classic', onSessionSaved,
      }), { initialProps: a },
    )
    rerender({ userId: 'u2', attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    await waitFor(() => expect(result.current.savedSession?.sessionId).toBe('session-b'))
    rerender(a)
    await waitFor(() => expect(result.current.savedSession?.sessionId).toBe('session-new-a'))
    await act(async () => {
      resolveOld({ sessionId: 'session-old-a', totalXP: 99, correctCount: 9, wrongCount: 0, newBadges: [] })
    })
    expect(result.current.savedSession?.sessionId).toBe('session-new-a')
    expect(result.current.savedSession?.totalXP).toBe(33)
    expect(onSessionSaved).toHaveBeenCalledTimes(2)
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(2)
    expect(mocks.saveGameSession).toHaveBeenCalledTimes(3)
  })

  it('verified callback degerlerini local cevap bayragindan degil session yanitindan alir', async () => {
    const onSessionSaved = vi.fn()
    mocks.saveGameSession.mockResolvedValueOnce({
      sessionId: 'session-1',
      totalXP: 0,
      correctCount: 0,
      wrongCount: 1,
      newBadges: [],
    })

    renderHook(() => useSessionSaver({
      screen: 'result',
      userId: 'u1',
      attemptId: ATTEMPT_ID,
      game: 'matematik',
      selectedMode: 'classic',
      onSessionSaved,
    }))

    await waitFor(() => expect(onSessionSaved).toHaveBeenCalledWith({
      correctAnswers: 0,
      totalQuestions: 1,
      maxStreak: 1,
      accuracy: 0,
      game: 'matematik',
    }))
  })
})
