/**
 * Bilge Arena Oda Sistemi: useRoomChannel hook smoke test
 * Sprint 1 PR4b Task 4
 *
 * Mount/unmount lifecycle smoke. setupRoomChannel cagrildi, dispatch
 * fonksiyonu gecirildi, unmount'ta channel.unsubscribe yapildi.
 */

import { describe, test, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const { mockSetupChannel, mockUnsubscribe, mockCreateClient } = vi.hoisted(() => ({
  mockSetupChannel: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ createClient: mockCreateClient }))
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
  scoreboard: [],
  online: new Set<string>(),
  isStale: false,
}

describe('useRoomChannel', () => {
  test('14) Mount -> setupRoomChannel called once; unmount -> channel.unsubscribe called', () => {
    const channelMock = {
      unsubscribe: mockUnsubscribe,
      socket: { onMessage: vi.fn(), onError: vi.fn() },
    }
    mockSetupChannel.mockReturnValue(channelMock)
    mockCreateClient.mockReturnValue({})

    const { unmount } = renderHook(() =>
      useRoomChannel('r1', 'u1', dummyInitial),
    )
    expect(mockSetupChannel).toHaveBeenCalledTimes(1)
    expect(mockSetupChannel).toHaveBeenCalledWith(
      {},
      'r1',
      'u1',
      expect.any(Function),
    )

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
