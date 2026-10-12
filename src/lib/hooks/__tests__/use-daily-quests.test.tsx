import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const questToast = vi.hoisted(() => vi.fn())
vi.mock('@/stores/toast-store', () => ({
  toast: { quest: questToast, success: vi.fn() },
}))

import { useDailyQuests } from '../use-daily-quests'

const incompleteQuest = {
  id: '10000000-0000-4000-8000-000000000001',
  quest_id: '20000000-0000-4000-8000-000000000001',
  user_id: '30000000-0000-4000-8000-000000000001',
  date: '2026-08-08',
  current_value: 0,
  is_completed: false,
  completed_at: null,
  xp_claimed: false,
  quest: { title: 'Bir oturum tamamla' },
}

const responseWith = (quests: unknown[]) => ({
  ok: true,
  json: vi.fn().mockResolvedValue({ quests }),
})

describe('useDailyQuests verified-session refresh', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(responseWith([incompleteQuest]))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('refreshes with GET after a saved session and never PATCHes progress', async () => {
    const { result } = renderHook(() => useDailyQuests(incompleteQuest.user_id))
    await waitFor(() => expect(result.current.loading).toBe(false))

    fetchMock.mockResolvedValueOnce(responseWith([
      { ...incompleteQuest, current_value: 1, is_completed: true, completed_at: '2026-08-08T10:00:00Z' },
    ]))

    let completed: unknown[] = []
    await act(async () => {
      completed = await result.current.updateProgress({
        correctAnswers: 1,
        totalQuestions: 1,
        maxStreak: 1,
        accuracy: 100,
        game: 'matematik',
      })
    })

    expect(fetchMock).toHaveBeenLastCalledWith('/api/quests')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
    expect(completed).toHaveLength(1)
    expect(questToast).toHaveBeenCalledWith('Bir oturum tamamla')
  })

  it('misafir için korumalı görev API istekleri göndermez', async () => {
    const { result } = renderHook(() => useDailyQuests())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => {
      expect(await result.current.refetch()).toEqual([])
      expect(await result.current.claimXP(incompleteQuest.id)).toBeNull()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hesap değişince önceki hesabın görevlerini ve geç gelen yanıtını göstermez', async () => {
    let resolveFirst!: (value: ReturnType<typeof responseWith>) => void
    fetchMock.mockReset()
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce(responseWith([{ ...incompleteQuest, id: 'second-quest', user_id: 'second-user' }]))

    const { result, rerender } = renderHook(({ userId }) => useDailyQuests(userId), {
      initialProps: { userId: incompleteQuest.user_id },
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    rerender({ userId: 'second-user' })
    expect(result.current.quests).toEqual([])
    await waitFor(() => expect(result.current.quests.map((quest) => quest.id)).toEqual(['second-quest']))

    await act(async () => resolveFirst(responseWith([incompleteQuest])))
    expect(result.current.quests.map((quest) => quest.id)).toEqual(['second-quest'])

    rerender({ userId: undefined as unknown as string })
    expect(result.current.quests).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
