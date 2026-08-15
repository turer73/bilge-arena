import { describe, expect, test } from 'vitest'
import {
  assistancePolicySchema,
  CLOSED_ASSISTANCE_POLICY,
  OPEN_ASSISTANCE_POLICY,
  examModeToggleInputSchema,
  examModeToggleResultSchema,
} from '../contract'

describe('assistancePolicySchema', () => {
  test('sınav modu kapalıyken üç yardımcı da açık olabilir', () => {
    const parsed = assistancePolicySchema.safeParse({
      examMode: false, board: true, coach: true, assistant: true, until: null,
    })
    expect(parsed.success).toBe(true)
  })

  test('sınav modu açıkken açık kalan yardımcı reddedilir', () => {
    for (const open of ['board', 'coach', 'assistant'] as const) {
      const parsed = assistancePolicySchema.safeParse({
        examMode: true,
        board: open === 'board',
        coach: open === 'coach',
        assistant: open === 'assistant',
        until: '2026-08-15T12:00:00+03:00',
      })
      expect(parsed.success).toBe(false)
    }
  })

  test('sınav modu açıkken üçü birden kapalı kabul edilir', () => {
    const parsed = assistancePolicySchema.safeParse({
      examMode: true, board: false, coach: false, assistant: false,
      until: '2026-08-15T12:00:00+03:00',
    })
    expect(parsed.success).toBe(true)
  })

  test('sözleşme dışı alan reddedilir', () => {
    expect(assistancePolicySchema.safeParse({
      ...OPEN_ASSISTANCE_POLICY, classroomId: 'x',
    }).success).toBe(false)
  })

  test('fail-closed varsayılan sözleşmeye uyar ve hiçbir yardımcı açmaz', () => {
    const parsed = assistancePolicySchema.safeParse(CLOSED_ASSISTANCE_POLICY)
    expect(parsed.success).toBe(true)
    expect(CLOSED_ASSISTANCE_POLICY.board).toBe(false)
    expect(CLOSED_ASSISTANCE_POLICY.coach).toBe(false)
    expect(CLOSED_ASSISTANCE_POLICY.assistant).toBe(false)
  })
})

describe('sınav modu değiştirme sözleşmesi', () => {
  test('requestId uuid olmalı', () => {
    expect(examModeToggleInputSchema.safeParse({ enabled: true, requestId: 'abc' }).success).toBe(false)
    expect(examModeToggleInputSchema.safeParse({
      enabled: true, requestId: '3f1c2d4e-5a6b-4c8d-9e0f-1a2b3c4d5e6f',
    }).success).toBe(true)
  })

  test('kapatma sonucunda until null olabilir', () => {
    expect(examModeToggleResultSchema.safeParse({
      classroomId: '3f1c2d4e-5a6b-4c8d-9e0f-1a2b3c4d5e6f',
      examMode: false, until: null, replayed: false,
    }).success).toBe(true)
  })
})
