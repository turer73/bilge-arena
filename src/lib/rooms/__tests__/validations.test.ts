/**
 * Bilge Arena Oda Sistemi: validations.ts Zod schema unit tests
 * Sprint 1 PR3
 */

import { describe, it, expect } from 'vitest'
import {
  createRoomSchema,
  joinRoomSchema,
  submitAnswerSchema,
  cancelRoomSchema,
  kickMemberSchema,
  ROOM_CODE_REGEX,
} from '../validations'

describe('createRoomSchema', () => {
  it('accepts minimal valid input with defaults', () => {
    const r = createRoomSchema.safeParse({ title: 'Test', category: 'sayilar' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.difficulty).toBe(2)
      expect(r.data.question_count).toBe(10)
      expect(r.data.max_players).toBe(8)
      expect(r.data.per_question_seconds).toBe(20)
      expect(r.data.mode).toBe('sync')
    }
  })

  it('rejects title <3 chars', () => {
    const r = createRoomSchema.safeParse({ title: 'Ab', category: 'sayilar' })
    expect(r.success).toBe(false)
  })

  it('rejects title >80 chars', () => {
    const r = createRoomSchema.safeParse({ title: 'A'.repeat(81), category: 'sayilar' })
    expect(r.success).toBe(false)
  })

  it('rejects difficulty out of range', () => {
    expect(createRoomSchema.safeParse({ title: 'Ok', category: 'sayilar', difficulty: 0 }).success).toBe(false)
    expect(createRoomSchema.safeParse({ title: 'Ok', category: 'sayilar', difficulty: 6 }).success).toBe(false)
  })

  it('rejects question_count <5 (DB CHECK constraint)', () => {
    const r = createRoomSchema.safeParse({ title: 'Ok', category: 'sayilar', question_count: 4 })
    expect(r.success).toBe(false)
  })

  it('rejects question_count >30', () => {
    const r = createRoomSchema.safeParse({ title: 'Ok', category: 'sayilar', question_count: 31 })
    expect(r.success).toBe(false)
  })

  it('rejects max_players <2 (anti-cheat min 2 oyuncu)', () => {
    const r = createRoomSchema.safeParse({ title: 'Ok', category: 'sayilar', max_players: 1 })
    expect(r.success).toBe(false)
  })

  it('rejects mode != sync|async', () => {
    const r = createRoomSchema.safeParse({ title: 'Ok', category: 'sayilar', mode: 'turn-based' })
    expect(r.success).toBe(false)
  })

  it('trims whitespace on title and category', () => {
    const r = createRoomSchema.safeParse({ title: '  Test Oda  ', category: '  sayilar  ' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.title).toBe('Test Oda')
      expect(r.data.category).toBe('sayilar')
    }
  })
})

describe('joinRoomSchema', () => {
  it('accepts valid Crockford-32 code', () => {
    const r = joinRoomSchema.safeParse({ code: 'TESTAB' })
    expect(r.success).toBe(true)
  })

  it('uppercases lowercase code', () => {
    const r = joinRoomSchema.safeParse({ code: 'testab' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.code).toBe('TESTAB')
  })

  it('rejects code with O (Crockford excludes 0/O/I/L/1)', () => {
    const r = joinRoomSchema.safeParse({ code: 'TESTOB' })
    expect(r.success).toBe(false)
  })

  it('rejects code with I', () => {
    const r = joinRoomSchema.safeParse({ code: 'TEISTA' })
    expect(r.success).toBe(false)
  })

  it('rejects code with 0', () => {
    const r = joinRoomSchema.safeParse({ code: 'TEST0A' })
    expect(r.success).toBe(false)
  })

  it('rejects 5-char code (must be 6)', () => {
    const r = joinRoomSchema.safeParse({ code: 'TESTAB'.slice(0, 5) })
    expect(r.success).toBe(false)
  })

  it('rejects 7-char code', () => {
    const r = joinRoomSchema.safeParse({ code: 'TESTABC' })
    expect(r.success).toBe(false)
  })
})

describe('submitAnswerSchema', () => {
  it('accepts non-empty answer', () => {
    expect(submitAnswerSchema.safeParse({ answer_value: 'a' }).success).toBe(true)
  })

  it('rejects empty answer', () => {
    expect(submitAnswerSchema.safeParse({ answer_value: '' }).success).toBe(false)
  })

  it('rejects whitespace-only', () => {
    expect(submitAnswerSchema.safeParse({ answer_value: '   ' }).success).toBe(false)
  })
})

describe('cancelRoomSchema', () => {
  it('uses default reason if missing', () => {
    const r = cancelRoomSchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.reason).toBe('host_canceled')
  })

  it('accepts custom reason', () => {
    const r = cancelRoomSchema.safeParse({ reason: 'rage_quit' })
    expect(r.success).toBe(true)
  })
})

describe('kickMemberSchema', () => {
  // Zod v4 uuid() RFC 4122 strict (memory `feedback_zod4_uuid_strict`):
  //   - Group 3 first nibble: version (1-5)
  //   - Group 4 first nibble: variant (8/9/a/b for RFC 4122)
  it('accepts valid RFC 4122 v4 UUID', () => {
    const r = kickMemberSchema.safeParse({
      target_user_id: '22222222-2222-4222-9222-222222222222',
    })
    expect(r.success).toBe(true)
  })

  it('rejects non-UUID string', () => {
    const r = kickMemberSchema.safeParse({ target_user_id: 'not-a-uuid' })
    expect(r.success).toBe(false)
  })

  it('rejects UUID with invalid variant nibble (Zod v4 strict)', () => {
    // Group 4 starts with '2' = NCS variant (NOT RFC 4122)
    const r = kickMemberSchema.safeParse({
      target_user_id: '22222222-2222-2222-2222-222222222222',
    })
    expect(r.success).toBe(false)
  })
})

describe('ROOM_CODE_REGEX', () => {
  it('matches all valid Crockford-32 examples', () => {
    expect(ROOM_CODE_REGEX.test('AAAAAA')).toBe(true)
    expect(ROOM_CODE_REGEX.test('234569')).toBe(true)
    expect(ROOM_CODE_REGEX.test('TESTAB')).toBe(true)
    expect(ROOM_CODE_REGEX.test('JKLMNN')).toBe(true)  // L allowed in our regex (J-N)
  })

  it('rejects ambiguous chars 0/I/O/1', () => {
    expect(ROOM_CODE_REGEX.test('A0AAAA')).toBe(false)
    expect(ROOM_CODE_REGEX.test('AIAAAA')).toBe(false)
    expect(ROOM_CODE_REGEX.test('AOAAAA')).toBe(false)
    expect(ROOM_CODE_REGEX.test('A1AAAA')).toBe(false)
  })
})
