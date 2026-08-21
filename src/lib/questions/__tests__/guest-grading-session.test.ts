import { describe, expect, it } from 'vitest'
import {
  createGuestGradingToken,
  guestGradingActorKey,
  GUEST_GRADING_COOKIE,
  readGuestGradingCookie,
  verifyGuestGradingToken,
} from '../guest-grading-session'

const QUESTION_ID = '10000000-0000-4000-8000-000000000001'
describe('guest grading session', () => {
  it('issues a signed per-preview session bound to the question set', () => {
    const first = createGuestGradingToken([QUESTION_ID])
    const second = createGuestGradingToken([QUESTION_ID])
    const parsedFirst = verifyGuestGradingToken(first)
    const parsedSecond = verifyGuestGradingToken(second)

    expect(parsedFirst?.questionIds).toEqual([QUESTION_ID])
    expect(parsedSecond?.questionIds).toEqual([QUESTION_ID])
    expect(parsedFirst?.sessionId).not.toBe(parsedSecond?.sessionId)
    expect(guestGradingActorKey(parsedFirst!.sessionId)).toBe(`guest:${parsedFirst!.sessionId}`)
  })

  it('rejects tampering, duplicates and malformed question identifiers', () => {
    const token = createGuestGradingToken([QUESTION_ID])

    expect(verifyGuestGradingToken(`${token}tampered`)).toBeNull()
    expect(createGuestGradingToken([QUESTION_ID, QUESTION_ID])).toBeNull()
    expect(createGuestGradingToken(['not-a-uuid'])).toBeNull()
  })

  it('reads only the dedicated cookie', () => {
    expect(readGuestGradingCookie(`foo=1; ${GUEST_GRADING_COOKIE}=signed%2Etoken; bar=2`))
      .toBe('signed.token')
    expect(readGuestGradingCookie('foo=1')).toBeNull()
  })
})
