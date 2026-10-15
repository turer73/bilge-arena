import { describe, expect, it } from 'vitest'
import { measurementRequestSchema, measurementSessionSchema } from '../contracts'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const session = () => ({ id: id(1), formId: id(2), game: 'matematik', examRef: 'TYT', examYear: 2027,
  protocol: 'closed-measurement@1', status: 'active', answered: 0, questionCount: 5,
  expiresAt: '2099-01-01T00:00:00Z', question: { id: id(3), position: 1, text: 'Soru', passage: null,
    options: ['a', 'b', 'c', 'd', 'e'] }, feedback: null, calibrated: false })
describe('measurement public boundary', () => {
  it('accepts correct TYT and LGS option counts', () => {
    expect(measurementSessionSchema.safeParse(session()).success).toBe(true)
    const lgs = session(); lgs.examRef = 'LGS'; lgs.question.options.pop()
    expect(measurementSessionSchema.safeParse(lgs).success).toBe(true)
    lgs.question.options.push('e'); expect(measurementSessionSchema.safeParse(lgs).success).toBe(false)
  })
  it.each(['answer', 'correct', 'solution', 'contentSha256', 'isCorrect'])('rejects leaked %s', key => {
    const s = session(); Object.assign(s.question, { [key]: 'secret' })
    expect(measurementSessionSchema.safeParse(s).success).toBe(false)
  })
  it('rejects active feedback and automatic calibration', () => {
    expect(measurementSessionSchema.safeParse({ ...session(), calibrated: true }).success).toBe(false)
    expect(measurementSessionSchema.safeParse({ ...session(), feedback: [] }).success).toBe(false)
    expect(measurementSessionSchema.safeParse({ ...session(), answered: 4 }).success).toBe(false)
  })
  it('requires genuine start notice and cannot take a user id or score from client', () => {
    const start = { action: 'start', formId: id(2), requestId: id(4), noticeAccepted: true }
    expect(measurementRequestSchema.safeParse(start).success).toBe(true)
    for (const extra of [{ noticeAccepted: false }, { userId: id(5) }, { isCorrect: true }, { calibration: true }]) {
      expect(measurementRequestSchema.safeParse({ ...start, ...extra }).success).toBe(false)
    }
  })
})
