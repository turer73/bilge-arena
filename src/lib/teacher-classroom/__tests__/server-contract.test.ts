import { describe, expect, it } from 'vitest'
import {
  studentAssignmentSubmitInputSchema,
  studentTeacherAssignmentSchema,
  teacherAssignmentPublishInputSchema,
  teacherClassroomNoStoreJson,
  teacherClassroomOverviewSchema,
  teacherClassroomRpcStatus,
  teacherInvitationAcceptInputSchema,
  teacherInvitationPreviewResponseSchema,
  teacherInviteRpcStatus,
  studentTeacherAssignmentsSchema,
  studentTeacherMembershipsSchema,
} from '../server-contract'

const ID = '11111111-1111-4111-8111-111111111111'
const CLASS_ID = '22222222-2222-4222-8222-222222222222'
const NOW = '2099-01-01T10:00:00.000Z'
const DUE = '2099-01-02T10:00:00.000Z'

function assignment(result: unknown = null) {
  return {
    id: ID,
    title: 'Kesirler Ödevi',
    status: result ? 'submitted' : 'active',
    availableAt: NOW,
    dueAt: DUE,
    classroom: { id: CLASS_ID, name: '12-A Matematik', teacherAlias: 'Öğretmen Deniz' },
    items: [{
      position: 1,
      question: {
        game: 'matematik',
        category: 'Temel',
        topic: 'Kesirler',
        difficulty: 2,
        content: { question: '1/2 + 1/2?', options: ['0', '1', '2', '3'] },
      },
    }],
    result,
    reward: { xp: 0, coins: 0, socialPoints: 0 },
  }
}

describe('teacher classroom strict public contracts', () => {
  it('rejects unknown publish fields and invalid game/exam or time windows', () => {
    const base = {
      title: 'Ödev',
      game: 'matematik',
      examRef: 'TYT',
      questionCount: 10,
      availableAt: NOW,
      dueAt: DUE,
      requestId: ID,
    }
    expect(teacherAssignmentPublishInputSchema.safeParse(base).success).toBe(true)
    expect(teacherAssignmentPublishInputSchema.safeParse({ ...base, questionIds: [ID] }).success)
      .toBe(false)
    expect(teacherAssignmentPublishInputSchema.safeParse({ ...base, game: 'wordquest' }).success)
      .toBe(false)
    expect(teacherAssignmentPublishInputSchema.safeParse({ ...base, dueAt: NOW }).success).toBe(false)
  })

  it('requires separate affirmative notice and sharing-consent actions', () => {
    const base = {
      token: 'a'.repeat(43),
      noticeVersion: 'notice-v1',
      noticeAcknowledged: true,
      sharingConsentVersion: 'share-v1',
      sharingConsent: true,
      requestId: ID,
    }
    expect(teacherInvitationAcceptInputSchema.safeParse(base).success).toBe(true)
    expect(teacherInvitationAcceptInputSchema.safeParse({ ...base, sharingConsent: false }).success)
      .toBe(false)
    expect(teacherInvitationAcceptInputSchema.safeParse({ ...base, noticeAcknowledged: false }).success)
      .toBe(false)
  })

  it('does not admit token, UUID or profile fields into invite preview', () => {
    const preview = {
      classroomName: '12-A Matematik',
      teacherAlias: 'Öğretmen Deniz',
      expiresAt: DUE,
      notice: { version: 'notice-v1', href: 'https://bilgearena.com/notice' },
      sharingConsent: { version: 'share-v1', href: 'https://bilgearena.com/consent' },
    }
    expect(teacherInvitationPreviewResponseSchema.safeParse(preview).success).toBe(true)
    expect(teacherInvitationPreviewResponseSchema.safeParse({ ...preview, token: 'a'.repeat(43) }).success)
      .toBe(false)
    expect(teacherInvitationPreviewResponseSchema.safeParse({ ...preview, teacherId: ID }).success)
      .toBe(false)
  })

  it('keeps the teacher overview aggregate-only and internally consistent', () => {
    const overview = {
      classroom: {
        id: CLASS_ID,
        name: '12-A Matematik',
        status: 'active',
        activeStudentCount: 1,
        hiddenRecipientCount: 0,
        createdAt: NOW,
      },
      activeStudents: [{ memberRef: 'a'.repeat(32), alias: 'Öğrenci Bir', joinedAt: NOW }],
      assignments: [{
        id: ID,
        title: 'Ödev',
        status: 'published',
        availableAt: NOW,
        dueAt: DUE,
        questionCount: 1,
        assignedCount: 1,
        submittedCount: 0,
        students: [{
          memberRef: 'a'.repeat(32),
          alias: 'Öğrenci Bir',
          status: 'assigned',
          answeredCount: 0,
          correctCount: 0,
          submittedAt: null,
        }],
      }],
    }
    expect(teacherClassroomOverviewSchema.safeParse(overview).success).toBe(true)
    expect(teacherClassroomOverviewSchema.safeParse({ ...overview, studentId: ID }).success).toBe(false)
    expect(teacherClassroomOverviewSchema.safeParse({
      ...overview,
      classroom: { ...overview.classroom, activeStudentCount: 2 },
    }).success).toBe(false)
    expect(JSON.stringify(teacherClassroomOverviewSchema.parse(overview)))
      .not.toMatch(/studentId|email|questionId|selectedOption|correctOption|mastery|fsrs/i)
  })

  it('rejects answer-key leakage while active and validates final grading exactly', () => {
    expect(studentTeacherAssignmentSchema.safeParse(assignment()).success).toBe(true)
    const leaked = assignment()
    leaked.items[0]!.question.content = {
      ...leaked.items[0]!.question.content,
      answer: 1,
    } as never
    expect(studentTeacherAssignmentSchema.safeParse(leaked).success).toBe(false)

    const result = {
      answeredCount: 1,
      correctCount: 1,
      items: [{ position: 1, selectedOption: 1, isCorrect: true, correctOption: 1 }],
    }
    expect(studentTeacherAssignmentSchema.safeParse(assignment(result)).success).toBe(true)
    expect(studentTeacherAssignmentSchema.safeParse(assignment({
      ...result,
      items: [{ ...result.items[0], isCorrect: false }],
    })).success).toBe(false)
  })

  it('requires a unique exact-shaped answer list', () => {
    const base = {
      requestId: ID,
      answers: [{ position: 1, selectedOption: null }],
    }
    expect(studentAssignmentSubmitInputSchema.safeParse(base).success).toBe(true)
    expect(studentAssignmentSubmitInputSchema.safeParse({
      ...base,
      answers: [...base.answers, ...base.answers],
    }).success).toBe(false)
    expect(studentAssignmentSubmitInputSchema.safeParse({
      ...base,
      answers: [{ position: 1, selectedOption: null, questionId: ID }],
    }).success).toBe(false)
  })

  it('preserves a submitted timestamp when an assignment is later closed', () => {
    const base = {
      id: ID,
      title: 'Ödev',
      status: 'closed',
      availableAt: NOW,
      dueAt: DUE,
      questionCount: 1,
      submittedAt: NOW,
      classroom: { id: CLASS_ID, name: '12-A Matematik', teacherAlias: 'Öğretmen Deniz' },
    }
    expect(studentTeacherAssignmentsSchema.safeParse({ assignments: [base] }).success).toBe(true)
    expect(studentTeacherAssignmentsSchema.safeParse({
      assignments: [{ ...base, status: 'active' }],
    }).success).toBe(false)
  })

  it('lists only the owner student membership without another student identifier', () => {
    const result = {
      classrooms: [{
        id: CLASS_ID,
        name: '12-A Matematik',
        teacherAlias: 'Öğretmen Deniz',
        joinedAt: NOW,
      }],
    }
    expect(studentTeacherMembershipsSchema.safeParse(result).success).toBe(true)
    expect(studentTeacherMembershipsSchema.safeParse({
      classrooms: [{ ...result.classrooms[0], memberRef: 'a'.repeat(32) }],
    }).success).toBe(false)
  })

  it('maps private errors without exposing database messages and disables caching', async () => {
    expect(teacherClassroomRpcStatus('42501')).toBe(403)
    expect(teacherClassroomRpcStatus('P0002')).toBe(404)
    expect(teacherClassroomRpcStatus('23514')).toBe(409)
    expect(teacherInviteRpcStatus('P0003')).toBe(410)
    const response = teacherClassroomNoStoreJson({ ok: true })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(await response.json()).toEqual({ ok: true })
  })
})
