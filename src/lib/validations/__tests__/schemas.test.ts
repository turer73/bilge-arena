import { describe, it, expect } from 'vitest'
import {
  chatMessageSchema,
  chatRequestSchema,
  commentContentSchema,
  errorReportSchema,
  profileUpdateSchema,
  sessionSubmitSchema,
  friendRequestSchema,
  friendActionSchema,
  referralApplySchema,
  LIMITS,
} from '../schemas'

describe('chatMessageSchema', () => {
  it('gecerli mesaji kabul eder', () => {
    const result = chatMessageSchema.safeParse({ role: 'user', content: 'Merhaba' })
    expect(result.success).toBe(true)
  })

  it('bos content reddeder', () => {
    const result = chatMessageSchema.safeParse({ role: 'user', content: '' })
    expect(result.success).toBe(false)
  })

  it('gecersiz role reddeder', () => {
    const result = chatMessageSchema.safeParse({ role: 'admin', content: 'test' })
    expect(result.success).toBe(false)
  })

  it('2000+ karakter content reddeder', () => {
    const longContent = 'a'.repeat(2001)
    const result = chatMessageSchema.safeParse({ role: 'user', content: longContent })
    expect(result.success).toBe(false)
  })
})

describe('chatRequestSchema', () => {
  it('gecerli request kabul eder', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'Merhaba' }],
    })
    expect(result.success).toBe(true)
  })

  it('bos messages dizisini reddeder', () => {
    const result = chatRequestSchema.safeParse({ messages: [] })
    expect(result.success).toBe(false)
  })

  it('50+ mesaji reddeder', () => {
    const messages = Array.from({ length: 51 }, () => ({
      role: 'user' as const,
      content: 'test',
    }))
    const result = chatRequestSchema.safeParse({ messages })
    expect(result.success).toBe(false)
  })

  it('questionContext opsiyonel', () => {
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'test' }],
      questionContext: 'Matematik sorusu',
    })
    expect(result.success).toBe(true)
  })
})

describe('commentContentSchema', () => {
  it('gecerli yorumu kabul eder', () => {
    const result = commentContentSchema.safeParse('Guzel soru!')
    expect(result.success).toBe(true)
  })

  it('bosluklari trimler', () => {
    const result = commentContentSchema.safeParse('  test  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('test')
    }
  })

  it('sadece bosluktan olusan yorumu reddeder', () => {
    const result = commentContentSchema.safeParse('   ')
    expect(result.success).toBe(false)
  })

  it('500+ karakter yorumu reddeder', () => {
    const result = commentContentSchema.safeParse('a'.repeat(501))
    expect(result.success).toBe(false)
  })
})

describe('errorReportSchema', () => {
  it('gecerli raporu kabul eder', () => {
    const result = errorReportSchema.safeParse({
      report_type: 'wrong_answer',
      description: 'Cevap yanlis',
    })
    expect(result.success).toBe(true)
  })

  it('description opsiyonel (default bos string)', () => {
    const result = errorReportSchema.safeParse({
      report_type: 'typo',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBe('')
    }
  })

  it('gecersiz report_type reddeder', () => {
    const result = errorReportSchema.safeParse({
      report_type: 'invalid_type',
    })
    expect(result.success).toBe(false)
  })

  it('tum rapor tiplerini kabul eder', () => {
    const types = ['wrong_answer', 'typo', 'unclear', 'duplicate', 'offensive', 'other']
    types.forEach((type) => {
      const result = errorReportSchema.safeParse({ report_type: type })
      expect(result.success).toBe(true)
    })
  })
})

describe('profileUpdateSchema', () => {
  it('gecerli profil guncellemesini kabul eder', () => {
    const result = profileUpdateSchema.safeParse({ display_name: 'Ali', grade: 11 })
    expect(result.success).toBe(true)
  })

  it('bos objeyi reddeder', () => {
    const result = profileUpdateSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('gecersiz grade reddeder (8 veya 14)', () => {
    expect(profileUpdateSchema.safeParse({ grade: 8 }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ grade: 14 }).success).toBe(false)
  })

  it('username 2-30 karakter sinirini uygular', () => {
    expect(profileUpdateSchema.safeParse({ username: 'a' }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ username: 'a'.repeat(31) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ username: 'ab' }).success).toBe(true)
  })
})

describe('sessionSubmitSchema', () => {
  const validSession = {
    game: 'matematik',
    mode: 'classic',
    answers: [{ questionId: '10000000-0000-4000-8000-000000000001', selectedOption: 1, isCorrect: true, timeTaken: 5 }],
  }

  it('gecerli session kabul eder', () => {
    expect(sessionSubmitSchema.safeParse(validSession).success).toBe(true)
  })

  it('bos answers reddeder', () => {
    expect(sessionSubmitSchema.safeParse({ ...validSession, answers: [] }).success).toBe(false)
  })

  it('timeLimit default 30', () => {
    const result = sessionSubmitSchema.safeParse(validSession)
    if (result.success) expect(result.data.timeLimit).toBe(30)
  })

  it('timeLimit 5-120 sinirini uygular', () => {
    expect(sessionSubmitSchema.safeParse({ ...validSession, timeLimit: 4 }).success).toBe(false)
    expect(sessionSubmitSchema.safeParse({ ...validSession, timeLimit: 121 }).success).toBe(false)
    expect(sessionSubmitSchema.safeParse({ ...validSession, timeLimit: 60 }).success).toBe(true)
  })

  it('gecersiz UUID questionId reddeder', () => {
    const bad = { ...validSession, answers: [{ questionId: 'not-uuid', selectedOption: 0, isCorrect: false, timeTaken: 1 }] }
    expect(sessionSubmitSchema.safeParse(bad).success).toBe(false)
  })
})

describe('friendRequestSchema', () => {
  it('gecerli UUID kabul eder', () => {
    expect(friendRequestSchema.safeParse({ friendId: '10000000-0000-4000-8000-000000000001' }).success).toBe(true)
  })

  it('gecersiz UUID reddeder', () => {
    expect(friendRequestSchema.safeParse({ friendId: 'abc' }).success).toBe(false)
  })
})

describe('friendActionSchema', () => {
  it('gecerli UUID kabul eder', () => {
    expect(friendActionSchema.safeParse({ friendshipId: '10000000-0000-4000-8000-000000000001' }).success).toBe(true)
  })
})

describe('referralApplySchema', () => {
  it('gecerli kodu kabul eder', () => {
    expect(referralApplySchema.safeParse({ code: 'ABC123' }).success).toBe(true)
  })

  it('bos kodu reddeder', () => {
    expect(referralApplySchema.safeParse({ code: '' }).success).toBe(false)
  })

  it('20+ karakter kodu reddeder', () => {
    expect(referralApplySchema.safeParse({ code: 'a'.repeat(21) }).success).toBe(false)
  })
})

describe('LIMITS sabitleri', () => {
  it('beklenen degerlere sahip', () => {
    expect(LIMITS.COMMENT_MAX_LENGTH).toBe(500)
    expect(LIMITS.CHAT_MAX_LENGTH).toBe(2000)
    expect(LIMITS.REPORT_DESCRIPTION_MAX_LENGTH).toBe(1000)
    expect(LIMITS.CHAT_MAX_MESSAGES).toBe(50)
  })
})
