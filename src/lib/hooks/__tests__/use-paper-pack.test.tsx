import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaperPack } from '../use-paper-pack'
import { fetchPaperPack, submitPaperPack } from '@/lib/paper-mode/client'
import type { PaperPackView } from '@/lib/paper-mode/server-contract'

vi.mock('@/lib/paper-mode/client', () => ({
  fetchPaperPack: vi.fn(),
  submitPaperPack: vi.fn(),
}))

const fetchMock = vi.mocked(fetchPaperPack)
const submitMock = vi.mocked(submitPaperPack)
const PACK_ID = '11111111-2222-4333-8444-555555555555'
const pack: PaperPackView = {
  packId: PACK_ID,
  status: 'active',
  createdAt: '2026-08-09T10:00:00.000+00:00',
  expiresAt: '2026-08-16T10:00:00.000+00:00',
  submittedAt: null,
  plan: { game: 'matematik', planDate: '2026-08-09', examRef: 'TYT' },
  items: [{
    position: 1,
    question: {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      game: 'matematik',
      category: null,
      topic: 'Sayılar',
      difficulty: 2,
      content: { question: '2 + 2 kaçtır?', options: ['3', '4'] },
    },
    selectedOption: null,
    isCorrect: null,
    correctOption: null,
  }],
  summary: null,
  mastery: { source: 'paper', weight: 0.5 },
  reward: { xp: 0, coins: 0, socialPoints: 0 },
  privacy: { ownerOnly: true, privateCacheDisabled: true },
}

describe('usePaperPack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads, retries, and exposes the strict pack', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(pack)
    const { result } = renderHook(() => usePaperPack(PACK_ID))
    await waitFor(() => expect(result.current.error).toBe('load'))

    await act(async () => {
      expect(await result.current.refresh()).toBe(true)
    })
    expect(result.current.pack).toEqual(pack)
    expect(fetchMock.mock.calls[1][1]).toBeInstanceOf(AbortSignal)
  })

  it('submits with an abort signal and replaces the pack with canonical result', async () => {
    const submitted = {
      ...pack,
      status: 'submitted' as const,
      submittedAt: '2026-08-09T11:00:00.000+00:00',
      items: [{ ...pack.items[0], selectedOption: 1, isCorrect: true, correctOption: 1 }],
      summary: { answeredCount: 1, correctCount: 1, scorePercent: 100 },
    }
    fetchMock.mockResolvedValue(pack)
    submitMock.mockResolvedValue({ pack: submitted, replayed: false })
    const { result } = renderHook(() => usePaperPack(PACK_ID))
    await waitFor(() => expect(result.current.pack).toEqual(pack))

    const input = {
      requestId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      answers: [{ position: 1, selectedOption: 1 }],
    }
    await act(async () => {
      expect(await result.current.submit(input)).toBe(true)
    })
    expect(submitMock).toHaveBeenCalledWith(PACK_ID, input, expect.any(AbortSignal))
    expect(result.current.pack).toEqual(submitted)
  })

  it('aborts the old load when the pack id changes', async () => {
    let firstSignal: AbortSignal | undefined
    fetchMock.mockImplementationOnce(async (_id, signal) => {
      firstSignal = signal
      return new Promise<never>(() => {})
    }).mockResolvedValueOnce(pack)
    const { rerender } = renderHook(({ id }) => usePaperPack(id), {
      initialProps: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender({ id: PACK_ID })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)
  })
})
