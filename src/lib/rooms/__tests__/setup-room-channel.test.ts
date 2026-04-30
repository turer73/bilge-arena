/**
 * Bilge Arena Oda Sistemi: setupRoomChannel (Side-Effect Layer) tests
 * Sprint 1 PR4b Task 3
 *
 * Side-effect layer: Supabase channel kurar, listener register eder, subscribe
 * yapar. 3 senaryo:
 *   - Channel name format: room-${roomId}
 *   - 4 postgres_changes filter (rooms id eq + room_members room_id eq x3)
 *   - subscribe() cagrildi
 */

import { describe, test, expect, vi } from 'vitest'
import { setupRoomChannel } from '../setup-room-channel'

const mockChannel = () => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
  track: vi.fn(),
  presenceState: vi.fn().mockReturnValue({}),
})

const mockSupabaseClient = (channel: ReturnType<typeof mockChannel>) => ({
  channel: vi.fn().mockReturnValue(channel),
})

describe('setupRoomChannel', () => {
  test('11) channel name format: room-${roomId}', () => {
    const ch = mockChannel()
    const sb = mockSupabaseClient(ch)
    setupRoomChannel(sb as never, 'r1', 'u1', vi.fn())
    expect(sb.channel).toHaveBeenCalledWith('room-r1', expect.any(Object))
  })

  test('12) postgres_changes filters: rooms (id eq.r1) + room_members (room_id eq.r1) x3', () => {
    const ch = mockChannel()
    const sb = mockSupabaseClient(ch)
    setupRoomChannel(sb as never, 'r1', 'u1', vi.fn())

    // 8 postgres_changes call:
    // - rooms UPDATE (id=eq.r1)
    // - room_members INSERT/UPDATE/DELETE (room_id=eq.r1, x3)
    // - room_rounds INSERT/UPDATE (room_id=eq.r1, x2 — Codex P1 PR #50 fix)
    // - room_answers INSERT/UPDATE (room_id=eq.r1, x2 — Codex P2 PR #54 fix)
    const calls = ch.on.mock.calls.filter((c) => c[0] === 'postgres_changes')
    expect(calls).toHaveLength(8)

    const filters = calls.map((c) => c[1].filter)
    expect(filters).toContain('id=eq.r1')
    expect(filters.filter((f) => f === 'room_id=eq.r1')).toHaveLength(7)
  })

  test('13) subscribe() called', () => {
    const ch = mockChannel()
    const sb = mockSupabaseClient(ch)
    setupRoomChannel(sb as never, 'r1', 'u1', vi.fn())
    expect(ch.subscribe).toHaveBeenCalled()
  })
})
