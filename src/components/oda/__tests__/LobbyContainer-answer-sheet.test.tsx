/**
 * Mobil sonuc paneli alt boslugu SonucView + host kontrollerini birlikte saran
 * kapsayiciya eklenir; "Sonraki Tura Gec" panelin arkasinda kalmaz (Codex P1, PR #706).
 */
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RoomState } from '@/lib/rooms/room-state-reducer'

let mockState: RoomState
vi.mock('@/lib/rooms/use-room-channel', () => ({
  useRoomChannel: () => ({
    state: mockState,
    isOnline: true,
    broadcastTyping: vi.fn(),
    setOptimisticMyAnswer: vi.fn(),
    updateOptimisticMember: vi.fn(),
    patchOptimisticCurrentRound: vi.fn(),
  }),
}))
vi.mock('../SonucView', () => ({ SonucView: () => <section data-testid="sonuc" /> }))
vi.mock('../HostGameActions', () => ({ HostGameActions: () => <button type="button">Sonraki Tura Geç</button> }))

import { LobbyContainer } from '../LobbyContainer'

function state(mode: 'sync' | 'async'): RoomState {
  return {
    room: { id: 'r1', host_id: 'u1', state: 'reveal', mode, question_count: 10, auto_advance_seconds: 0 },
    members: [{ user_id: 'u1', score: 0, finished_at: null }],
    current_round: { round_index: 2 },
    my_answer: { answer_value: '1' },
    answers_count: 1,
  } as unknown as RoomState
}

describe('LobbyContainer mobil sonuç paneli kabuğu', () => {
  test.each(['sync', 'async'] as const)('%s reveal: kabuk SonucView ve host kontrollerini birlikte kapsar', (mode) => {
    mockState = state(mode)
    render(<LobbyContainer roomId="r1" userId="u1" initialState={mockState} />)
    const host = screen.getByTestId('sonuc').closest('[data-answer-sheet-host]')
    expect(host).not.toBeNull()
    expect(host).toContainElement(screen.getByRole('button', { name: 'Sonraki Tura Geç' }))
  })
})
