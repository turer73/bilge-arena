/**
 * Bilge Arena Oda Sistemi: roomStateReducer (Pure State Machine) tests
 * Sprint 1 PR4b Task 2
 *
 * Pure func, side-effect yok. 10 senaryo:
 *   - HYDRATE (REST resync) idempotent uygulanir
 *   - 4 member event (INSERT idempotent / UPDATE / DELETE)
 *   - ROOM_UPDATE (lobby -> in_progress)
 *   - 3 presence event (sync replace, join add, leave remove)
 *   - CHANNEL_ERROR -> isStale=true
 *   - Unknown event defensive (referans degismez)
 */

import { describe, test, expect } from 'vitest'
import {
  roomStateReducer,
  type RoomState,
  type Member,
} from '../room-state-reducer'

const initialMember = (overrides: Partial<Member> = {}): Member => ({
  user_id: 'u1',
  display_name: 'Player1',
  joined_at: '2026-04-30T00:00:00Z',
  is_host: false,
  is_kicked: false,
  ...overrides,
})

const initialState = (): RoomState => ({
  room: {
    id: 'r1',
    code: 'BLZGE2',
    title: 'Test',
    state: 'lobby',
    mode: 'sync',
    host_id: 'u-host',
    category: 'genel-kultur',
    difficulty: 2,
    question_count: 10,
    max_players: 8,
    per_question_seconds: 20,
    created_at: '2026-04-30T00:00:00Z',
  },
  members: [],
  current_round: null,
  answers_count: 0,
  my_answer: null,
  scoreboard: [],
  online: new Set<string>(),
  typing_users: new Set<string>(),
  isStale: false,
})

describe('roomStateReducer', () => {
  test('1) HYDRATE -> tum state set, isStale=false', () => {
    const fresh = {
      room: initialState().room,
      members: [initialMember()],
      current_round: null,
      answers_count: 0,
      my_answer: null,
  scoreboard: [],
    }
    const result = roomStateReducer(initialState(), {
      type: 'HYDRATE',
      payload: fresh,
    })
    expect(result.members).toHaveLength(1)
    expect(result.isStale).toBe(false)
  })

  test('2) MEMBER_INSERT -> liste buyur', () => {
    const result = roomStateReducer(initialState(), {
      type: 'MEMBER_INSERT',
      payload: initialMember(),
    })
    expect(result.members).toHaveLength(1)
    expect(result.members[0].user_id).toBe('u1')
  })

  test('3) MEMBER_INSERT idempotent — ayni user_id eklenmiyor', () => {
    const s = { ...initialState(), members: [initialMember()] }
    const result = roomStateReducer(s, {
      type: 'MEMBER_INSERT',
      payload: initialMember(),
    })
    expect(result.members).toHaveLength(1) // hala 1
  })

  test('4) MEMBER_UPDATE -> kicked=true update', () => {
    const s = { ...initialState(), members: [initialMember()] }
    const result = roomStateReducer(s, {
      type: 'MEMBER_UPDATE',
      payload: initialMember({ is_kicked: true }),
    })
    expect(result.members[0].is_kicked).toBe(true)
  })

  test('5) MEMBER_DELETE -> liste kucur', () => {
    const s = { ...initialState(), members: [initialMember()] }
    const result = roomStateReducer(s, {
      type: 'MEMBER_DELETE',
      payload: { user_id: 'u1' },
    })
    expect(result.members).toHaveLength(0)
  })

  test('6) ROOM_UPDATE -> state lobby->active', () => {
    const result = roomStateReducer(initialState(), {
      type: 'ROOM_UPDATE',
      payload: { state: 'active', started_at: '2026-04-30T01:00:00Z' },
    })
    expect(result.room.state).toBe('active')
    expect(result.room.started_at).toBe('2026-04-30T01:00:00Z')
  })

  test('7) PRESENCE_SYNC -> online Set replace', () => {
    const s = { ...initialState(), online: new Set(['old']) }
    const result = roomStateReducer(s, {
      type: 'PRESENCE_SYNC',
      payload: { online: ['u1', 'u2'] },
    })
    expect(result.online.has('u1')).toBe(true)
    expect(result.online.has('old')).toBe(false)
  })

  test('8) PRESENCE_JOIN -> online ekle, PRESENCE_LEAVE -> cikar', () => {
    const s1 = roomStateReducer(initialState(), {
      type: 'PRESENCE_JOIN',
      payload: { user_id: 'u1' },
    })
    expect(s1.online.has('u1')).toBe(true)
    const s2 = roomStateReducer(s1, {
      type: 'PRESENCE_LEAVE',
      payload: { user_id: 'u1' },
    })
    expect(s2.online.has('u1')).toBe(false)
  })

  test('9) CHANNEL_ERROR -> isStale=true', () => {
    const result = roomStateReducer(initialState(), {
      type: 'CHANNEL_ERROR',
      payload: { error: 'connection lost' },
    })
    expect(result.isStale).toBe(true)
  })

  test('10) Unknown event (defensive) -> state referans degismez', () => {
    const s = initialState()
    // @ts-expect-error - unknown event tipi test ediliyor
    const result = roomStateReducer(s, { type: 'UNKNOWN', payload: {} })
    expect(result).toBe(s)
  })

  test('11) PR4h: TYPING_START -> typing_users ekle, TYPING_STOP -> cikar', () => {
    const s1 = roomStateReducer(initialState(), {
      type: 'TYPING_START',
      payload: { user_id: 'u1' },
    })
    expect(s1.typing_users.has('u1')).toBe(true)

    const s2 = roomStateReducer(s1, {
      type: 'TYPING_STOP',
      payload: { user_id: 'u1' },
    })
    expect(s2.typing_users.has('u1')).toBe(false)
  })

  test('12) PR4h: TYPING_START idempotent — ayni kullanici ekleme yenilemez referans', () => {
    const s1 = roomStateReducer(initialState(), {
      type: 'TYPING_START',
      payload: { user_id: 'u1' },
    })
    const s2 = roomStateReducer(s1, {
      type: 'TYPING_START',
      payload: { user_id: 'u1' },
    })
    expect(s2).toBe(s1)
  })

  // ===========================================================================
  // Async PR1 Faz B1 testleri (3 yeni test)
  // ===========================================================================

  test('13) Async B1: MEMBER_OPTIMISTIC_UPDATE — caller member alanlari merge', () => {
    const me = initialMember({
      user_id: 'me',
      current_round_index: 1,
      score: 0,
    })
    const other = initialMember({ user_id: 'other', current_round_index: 1 })
    const s = { ...initialState(), members: [me, other] }

    const result = roomStateReducer(s, {
      type: 'MEMBER_OPTIMISTIC_UPDATE',
      payload: {
        user_id: 'me',
        updates: {
          current_round_index: 2,
          current_round_started_at: '2026-05-04T10:00:00Z',
          score: 850,
        },
      },
    })

    const updated = result.members.find((m) => m.user_id === 'me')!
    expect(updated.current_round_index).toBe(2)
    expect(updated.current_round_started_at).toBe('2026-05-04T10:00:00Z')
    expect(updated.score).toBe(850)
    // Other uye degismedi
    const otherSame = result.members.find((m) => m.user_id === 'other')!
    expect(otherSame.current_round_index).toBe(1)
  })

  test('14) Async B1: HYDRATE async-fresher — lokal optimistic ileride ise korunur', () => {
    const localMe = initialMember({
      user_id: 'me',
      current_round_index: 3,
      current_round_started_at: '2026-05-04T10:05:00Z',
      score: 1500,
    })
    const stateWithLocal: RoomState = {
      ...initialState(),
      room: { ...initialState().room, mode: 'async' },
      members: [localMe],
    }

    // Server polling stale: current_round_index=2 (lokal=3 ileride)
    const serverFresh = {
      room: { ...initialState().room, mode: 'async' as const },
      members: [
        initialMember({
          user_id: 'me',
          current_round_index: 2,
          current_round_started_at: '2026-05-04T10:00:00Z',
          score: 800,
        }),
      ],
      current_round: null,
      answers_count: 0,
      my_answer: null,
      scoreboard: [],
    }

    const result = roomStateReducer(stateWithLocal, {
      type: 'HYDRATE',
      payload: serverFresh,
      caller_user_id: 'me',
    })

    const meAfter = result.members.find((m) => m.user_id === 'me')!
    expect(meAfter.current_round_index).toBe(3) // lokal korundu
    expect(meAfter.score).toBe(1500) // lokal korundu (max)
  })

  test('15) Async B1: HYDRATE sync mode normal replace — caller_user_id ihmal edilir', () => {
    const localMe = initialMember({ user_id: 'me', score: 500 })
    const stateWithLocal: RoomState = {
      ...initialState(),
      members: [localMe],
    }

    // Sync modda server kazanir, lokal optimistic-fresher logic devre disi
    const serverFresh = {
      room: initialState().room, // mode='sync'
      members: [initialMember({ user_id: 'me', score: 300 })],
      current_round: null,
      answers_count: 0,
      my_answer: null,
      scoreboard: [],
    }

    const result = roomStateReducer(stateWithLocal, {
      type: 'HYDRATE',
      payload: serverFresh,
      caller_user_id: 'me',
    })

    const meAfter = result.members.find((m) => m.user_id === 'me')!
    expect(meAfter.score).toBe(300) // server kazandi (sync mode)
  })

  test('16) Async B1: HYDRATE async server-fresher — lokal eskiyse server kazanir', () => {
    const localMe = initialMember({
      user_id: 'me',
      current_round_index: 1,
      score: 100,
    })
    const stateWithLocal: RoomState = {
      ...initialState(),
      room: { ...initialState().room, mode: 'async' },
      members: [localMe],
    }

    // Server: round 2'ye gectim (lokal hala round 1)
    const serverFresh = {
      room: { ...initialState().room, mode: 'async' as const },
      members: [
        initialMember({
          user_id: 'me',
          current_round_index: 2,
          score: 800,
        }),
      ],
      current_round: null,
      answers_count: 0,
      my_answer: null,
      scoreboard: [],
    }

    const result = roomStateReducer(stateWithLocal, {
      type: 'HYDRATE',
      payload: serverFresh,
      caller_user_id: 'me',
    })

    const meAfter = result.members.find((m) => m.user_id === 'me')!
    expect(meAfter.current_round_index).toBe(2) // server kazandi (lokal eski)
    expect(meAfter.score).toBe(800)
  })
})
