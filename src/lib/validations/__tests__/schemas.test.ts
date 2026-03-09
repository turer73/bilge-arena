import { describe, it, expect } from 'vitest'
import {
  chatMessageSchema,
  chatRequestSchema,
  commentContentSchema,
  errorReportSchema,
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

describe('LIMITS sabitleri', () => {
  it('beklenen degerlere sahip', () => {
    expect(LIMITS.COMMENT_MAX_LENGTH).toBe(500)
    expect(LIMITS.CHAT_MAX_LENGTH).toBe(2000)
    expect(LIMITS.REPORT_DESCRIPTION_MAX_LENGTH).toBe(1000)
    expect(LIMITS.CHAT_MAX_MESSAGES).toBe(50)
  })
})
