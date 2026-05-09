/**
 * Bilge Arena Oda Sistemi: useRoomChannel hook smoke test
 * Sprint 1 PR4b Task 4
 *
 * Mount/unmount lifecycle smoke. setupRoomChannel cagrildi, dispatch
 * fonksiyonu gecirildi, unmount'ta channel.unsubscribe yapildi.
 *
 * 2026-05-03: Polling fallback test (isStale -> 3sn /state resync).
 */

import { describe, test, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { mockSetupChannel, mockUnsubscribe, mockCreateOdaClient } = vi.hoisted(() => ({
  mockSetupChannel: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockCreateOdaClient: vi.fn(),
}))

vi.mock('../oda-realtime-client', () => ({ createOdaRealtimeClient: mockCreateOdaClient }))
vi.mock('../setup-room-channel', () => ({ setupRoomChannel: mockSetupChannel }))

import { useRoomChannel } from '../use-room-channel'
import type { RoomState } from '../room-state-reducer'

const dummyInitial: RoomState = {
  room: {
    id: 'r1',
    code: 'BLZGE2',
    title: 'T',
    state: 'lobby',
    mode: 'sync',
    host_id: 'h',
    category: 'g',
    difficulty: 2,
    question_count: 10,
    max_players: 8,
    per_question_seconds: 20,
    created_at: '2026-04-30',
  },
  members: [],
  current_round: null,
  answers_count: 0,
  my_answer: null,
  scoreboard: [],
  online: new Set<string>(),
  typing_users: new Set<string>(),
  isStale: false,
}

describe('useRoomChannel', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('14) Mount -> setupRoomChannel called once; unmount -> channel.unsubscribe called', async () => {
    const mockClient = { onError: vi.fn(), disconnect: vi.fn() }
    const channelMock = { unsubscribe: mockUnsubscribe }
    mockSetupChannel.mockReturnValue(channelMock)
    mockCreateOdaClient.mockResolvedValue(mockClient)

    const { unmount } = renderHook(() =>
      useRoomChannel('r1', 'u1', dummyInitial),
    )
    await act(async () => {})
    expect(mockSetupChannel).toHaveBeenCalledTimes(1)
    expect(mockSetupChannel).toHaveBeenCalledWith(
      mockClient,
      'r1',
      'u1',
      expect.any(Function),
      expect.any(Function),
    )

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  test('15) isStale=true initial -> polling 3sn /state fetch; unmount clears interval', async () => {
    vi.useFakeTimers()
    const channelMock = {
      unsubscribe: mockUnsubscribe,
      socket: { onMessage: vi.fn(), onError: vi.fn() },
    }
    mockSetupChannel.mockReturnValue(channelMock)
    mockCreateOdaClient.mockResolvedValue({ onError: vi.fn(), disconnect: vi.fn() })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        room: { ...dummyInitial.room, state: 'active' },
        members: [],
        current_round: null,
        answers_count: 0,
        my_answer: null,
        scoreboard: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const staleInitial = { ...dummyInitial, isStale: true }
    const { unmount } = renderHook(() =>
      useRoomChannel('r1', 'u1', staleInitial),
    )

    // Mount aninda 1 initial fetch + 3s polling = toplam 2 cagri.
    // Initial refetch (bos deps useEffect) mount sirasinda calisir; polling da
    // isStale=true iken 3sn'de bir kez tetiklenir.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/rooms/r1/state')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Unmount sonrasi 10sn gec — yeni fetch yok (interval temizlendi).
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
