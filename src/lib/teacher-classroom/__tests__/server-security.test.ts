import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  deriveTeacherInviteToken,
  digestTeacherInviteToken,
  getTeacherClassroomServerConfig,
  legalVersionsMatch,
  selectTeacherAssignmentQuestionIds,
  teacherInviteSharePath,
} from '../server-security'

const envKeys = [
  'TEACHER_CLASSROOM_ENABLED',
  'TEACHER_CLASSROOM_INVITE_SECRET',
  'TEACHER_CLASSROOM_NOTICE_VERSION',
  'TEACHER_CLASSROOM_NOTICE_URL',
  'TEACHER_CLASSROOM_CONSENT_VERSION',
  'TEACHER_CLASSROOM_CONSENT_URL',
] as const
const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

function validConfig() {
  process.env.TEACHER_CLASSROOM_ENABLED = 'true'
  process.env.TEACHER_CLASSROOM_INVITE_SECRET = 's'.repeat(32)
  process.env.TEACHER_CLASSROOM_NOTICE_VERSION = 'notice-v1'
  process.env.TEACHER_CLASSROOM_NOTICE_URL = 'https://bilgearena.com/hukuk/notice'
  process.env.TEACHER_CLASSROOM_CONSENT_VERSION = 'share-v1'
  process.env.TEACHER_CLASSROOM_CONSENT_URL = 'https://bilgearena.com/hukuk/consent'
}

beforeEach(() => {
  for (const key of envKeys) delete process.env[key]
})

afterAll(() => {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key]
    else process.env[key] = previous[key]
  }
})

describe('teacher classroom server security', () => {
  it('fails closed unless flag, separate 32-byte secret and HTTPS legal config all exist', () => {
    expect(getTeacherClassroomServerConfig()).toBeNull()
    validConfig()
    expect(getTeacherClassroomServerConfig()).toMatchObject({
      noticeVersion: 'notice-v1',
      sharingConsentVersion: 'share-v1',
    })
    process.env.TEACHER_CLASSROOM_INVITE_SECRET = 'short'
    expect(getTeacherClassroomServerConfig()).toBeNull()
    validConfig()
    process.env.TEACHER_CLASSROOM_NOTICE_URL = 'http://bilgearena.com/notice'
    expect(getTeacherClassroomServerConfig()).toBeNull()
  })

  it('derives deterministic opaque tokens, stores only their digest and uses a fragment share path', () => {
    const base = {
      secret: 'x'.repeat(32),
      teacherId: '11111111-1111-4111-8111-111111111111',
      classroomId: '22222222-2222-4222-8222-222222222222',
      requestId: '33333333-3333-4333-8333-333333333333',
    }
    const token = deriveTeacherInviteToken(base)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(deriveTeacherInviteToken(base)).toBe(token)
    expect(deriveTeacherInviteToken({ ...base, requestId: '44444444-4444-4444-8444-444444444444' }))
      .not.toBe(token)
    expect(digestTeacherInviteToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(digestTeacherInviteToken(token)).not.toContain(token)
    expect(teacherInviteSharePath(token)).toBe(`/arena/sinif/davet#token=${token}`)
    expect(teacherInviteSharePath(token)).not.toContain('?')
  })

  it('requires exact current legal versions', () => {
    validConfig()
    const config = getTeacherClassroomServerConfig()!
    expect(legalVersionsMatch(config, {
      noticeVersion: 'notice-v1',
      sharingConsentVersion: 'share-v1',
    })).toBe(true)
    expect(legalVersionsMatch(config, {
      noticeVersion: 'notice-v0',
      sharingConsentVersion: 'share-v1',
    })).toBe(false)
  })

  it('selects only server candidate IDs in a stable request-scoped order', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
    }))
    const input = {
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      questionCount: 3,
    }
    const selected = selectTeacherAssignmentQuestionIds(rows, input)
    expect(selected).toHaveLength(3)
    expect(selectTeacherAssignmentQuestionIds([...rows].reverse(), input)).toEqual(selected)
    expect(selected?.every((id) => rows.some((row) => row.id === id))).toBe(true)
    expect(selectTeacherAssignmentQuestionIds(rows.slice(0, 2), input)).toBeNull()
    expect(selectTeacherAssignmentQuestionIds([{ id: 'not-a-uuid' }], input)).toBeNull()
  })
})
