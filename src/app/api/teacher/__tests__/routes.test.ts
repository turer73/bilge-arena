import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/teacher-classroom/route-context', () => ({
  requireTeacherClassroomRouteContext: mocks.context,
}))

import { GET as listClasses, POST as createClass } from '../classrooms/route'
import { GET as getOverview } from '../classrooms/[classroomId]/route'
import {
  GET as getBilgeTahtaAccess,
  PATCH as updateBilgeTahtaAccess,
} from '../classrooms/[classroomId]/bilge-tahta/route'
import { POST as issueInvite } from '../classrooms/[classroomId]/invites/route'
import { POST as publishAssignment } from '../classrooms/[classroomId]/assignments/route'
import { POST as removeMember } from '../classrooms/[classroomId]/members/[memberRef]/remove/route'
import { POST as withdraw } from '../classrooms/[classroomId]/withdraw/route'
import { POST as revokeInvite } from '../invites/[inviteRef]/route'
import { POST as previewInvite } from '../invitations/preview/route'
import { POST as acceptInvite } from '../invitations/accept/route'
import { GET as listAssignments } from '../assignments/route'
import { GET as listMemberships } from '../memberships/route'
import { GET as getAssignment, POST as submitAssignment } from '../assignments/[assignmentId]/route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CLASS_ID = '22222222-2222-4222-8222-222222222222'
const ASSIGNMENT_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'
const QUESTION_IDS = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
]
const INVITE_REF = 'a'.repeat(32)
const TOKEN = 'b'.repeat(43)
const NOW = '2099-01-01T10:00:00.000Z'
const DUE = '2099-01-02T10:00:00.000Z'

const config = {
  inviteSecret: 's'.repeat(32),
  noticeVersion: 'notice-v1',
  noticeHref: 'https://bilgearena.com/notice',
  sharingConsentVersion: 'share-v1',
  sharingConsentHref: 'https://bilgearena.com/consent',
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function query(result: { data: unknown; error: { code?: string } | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise<unknown>
  } = {}
  for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function assignment(result: unknown = null) {
  return {
    id: ASSIGNMENT_ID,
    title: 'Üç Soruluk Ödev',
    status: result ? 'submitted' : 'active',
    availableAt: NOW,
    dueAt: DUE,
    classroom: { id: CLASS_ID, name: '12-A Matematik', teacherAlias: 'Öğretmen Deniz' },
    items: [{
      position: 1,
      question: {
        game: 'matematik',
        category: 'Temel',
        topic: 'Sayılar',
        difficulty: 2,
        content: { question: '1 + 1?', options: ['1', '2', '3', '4'] },
      },
    }],
    result,
    reward: { xp: 0, coins: 0, socialPoints: 0 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({
    ok: true,
    userId: USER_ID,
    admin: { rpc: mocks.rpc, from: mocks.from },
    config,
  })
  process.env.BILGE_TAHTA_PILOT_ENABLED = 'true'
  process.env.BILGE_TAHTA_PILOT_INSTITUTION_ID = CLASS_ID
})

describe('R4.2 teacher classroom API routes', () => {
  it('lists/creates only strict teacher-owned classroom responses', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_my_teacher_classrooms') {
        return {
          data: { classrooms: [{
            id: CLASS_ID,
            name: '12-A Matematik',
            status: 'active',
            activeStudentCount: 0,
            assignmentCount: 0,
            createdAt: NOW,
          }] },
          error: null,
        }
      }
      if (name === 'create_teacher_classroom') {
        return {
          data: {
            classroom: { id: CLASS_ID, name: '12-A Matematik', status: 'active', createdAt: NOW },
            replayed: false,
          },
          error: null,
        }
      }
      throw new Error(`unexpected rpc ${name}`)
    })

    const listed = await listClasses(new Request('http://localhost/api/teacher/classrooms'))
    expect(listed.status).toBe(200)
    expect((await listed.json()).classrooms[0].id).toBe(CLASS_ID)
    const created = await createClass(jsonRequest('/api/teacher/classrooms', {
      name: '12-A Matematik',
      requestId: REQUEST_ID,
    }))
    expect(created.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('create_teacher_classroom', {
      p_user_id: USER_ID,
      p_name: '12-A Matematik',
      p_request_id: REQUEST_ID,
    })

    mocks.rpc.mockClear()
    expect((await createClass(jsonRequest('/api/teacher/classrooms', {
      name: '12-A Matematik',
      requestId: REQUEST_ID,
      teacherId: USER_ID,
    }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('runtime-validates aggregate overview and rejects a student UUID leak', async () => {
    const overview = {
      classroom: {
        id: CLASS_ID,
        name: '12-A Matematik',
        status: 'active',
        activeStudentCount: 0,
        hiddenRecipientCount: 0,
        createdAt: NOW,
      },
      activeStudents: [],
      assignments: [],
    }
    mocks.rpc.mockResolvedValueOnce({ data: overview, error: null })
    expect((await getOverview(
      new Request(`http://localhost/api/teacher/classrooms/${CLASS_ID}`),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )).status).toBe(200)
    mocks.rpc.mockResolvedValueOnce({ data: { ...overview, studentId: USER_ID }, error: null })
    expect((await getOverview(
      new Request(`http://localhost/api/teacher/classrooms/${CLASS_ID}`),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )).status).toBe(500)
  })

  it('reads class-scoped Bilge Tahta access and requires a strict teacher update', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_my_classroom_bilge_tahta_access') {
        return { data: { enabled: false }, error: null }
      }
      if (name === 'set_teacher_classroom_bilge_tahta') {
        return {
          data: { classroomId: CLASS_ID, enabled: true, replayed: false },
          error: null,
        }
      }
      throw new Error(`unexpected rpc ${name}`)
    })

    const read = await getBilgeTahtaAccess(
      new Request(`http://localhost/api/teacher/classrooms/${CLASS_ID}/bilge-tahta`),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual({ enabled: false })
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_classroom_bilge_tahta_access', {
      p_user_id: USER_ID,
      p_classroom_id: CLASS_ID,
      p_institution_id: CLASS_ID,
    })

    mocks.context.mockClear()
    const updated = await updateBilgeTahtaAccess(
      jsonRequest(`/api/teacher/classrooms/${CLASS_ID}/bilge-tahta`, {
        enabled: true,
        requestId: REQUEST_ID,
      }),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )
    expect(updated.status).toBe(200)
    expect(mocks.context.mock.calls[0]?.[2]).toBe(true)
    expect(mocks.rpc).toHaveBeenLastCalledWith('set_teacher_classroom_bilge_tahta', {
      p_user_id: USER_ID,
      p_classroom_id: CLASS_ID,
      p_institution_id: CLASS_ID,
      p_enabled: true,
      p_request_id: REQUEST_ID,
    })

    mocks.rpc.mockClear()
    const leaked = await updateBilgeTahtaAccess(
      jsonRequest(`/api/teacher/classrooms/${CLASS_ID}/bilge-tahta`, {
        enabled: true,
        requestId: REQUEST_ID,
        studentId: USER_ID,
      }),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )
    expect(leaked.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns a deterministic raw invite only from issue while RPC receives only its digest', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
    mocks.rpc.mockResolvedValue({
      data: { inviteRef: INVITE_REF, expiresAt, maxUses: 10, usedCount: 0, replayed: false },
      error: null,
    })
    const request = () => jsonRequest(`/api/teacher/classrooms/${CLASS_ID}/invites`, {
      expiresAt,
      maxUses: 10,
      requestId: REQUEST_ID,
    })
    const first = await issueInvite(request(), { params: Promise.resolve({ classroomId: CLASS_ID }) })
    const firstBody = await first.json()
    const second = await issueInvite(request(), { params: Promise.resolve({ classroomId: CLASS_ID }) })
    const secondBody = await second.json()
    expect(firstBody.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(secondBody.token).toBe(firstBody.token)
    expect(firstBody.sharePath).toBe(`/arena/sinif/davet#token=${firstBody.token}`)
    const rpcPayload = mocks.rpc.mock.calls[0][1]
    expect(rpcPayload.p_token_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(rpcPayload)).not.toContain(firstBody.token)
  })

  it('previews without reflecting the token and requires exact current legal versions on accept', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'preview_teacher_classroom_invite') {
        return {
          data: {
            classroomName: '12-A Matematik',
            teacherAlias: 'Öğretmen Deniz',
            expiresAt: DUE,
          },
          error: null,
        }
      }
      if (name === 'accept_teacher_classroom_invite') {
        return {
          data: {
            classroom: { id: CLASS_ID, name: '12-A Matematik', teacherAlias: 'Öğretmen Deniz' },
            membershipStatus: 'active',
            joinedAt: NOW,
            replayed: false,
          },
          error: null,
        }
      }
      throw new Error(`unexpected rpc ${name}`)
    })
    const preview = await previewInvite(jsonRequest('/api/teacher/invitations/preview', { token: TOKEN }))
    const previewBody = await preview.json()
    expect(preview.status).toBe(200)
    expect(JSON.stringify(previewBody)).not.toContain(TOKEN)
    expect(previewBody.notice.version).toBe('notice-v1')

    const stale = await acceptInvite(jsonRequest('/api/teacher/invitations/accept', {
      token: TOKEN,
      noticeVersion: 'notice-v0',
      noticeAcknowledged: true,
      sharingConsentVersion: 'share-v1',
      sharingConsent: true,
      requestId: REQUEST_ID,
    }))
    expect(stale.status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)

    const accepted = await acceptInvite(jsonRequest('/api/teacher/invitations/accept', {
      token: TOKEN,
      noticeVersion: 'notice-v1',
      noticeAcknowledged: true,
      sharingConsentVersion: 'share-v1',
      sharingConsent: true,
      requestId: REQUEST_ID,
    }))
    expect(accepted.status).toBe(200)
    expect(JSON.stringify(await accepted.json())).not.toContain(TOKEN)
  })

  it('selects assignment IDs only from the filtered active server pool', async () => {
    const questionQuery = query({ data: QUESTION_IDS.map((id) => ({ id })), error: null })
    mocks.from.mockReturnValue(questionQuery)
    mocks.rpc.mockResolvedValue({
      data: {
        assignmentId: ASSIGNMENT_ID,
        status: 'published',
        availableAt: NOW,
        dueAt: DUE,
        questionCount: 2,
        recipientCount: 3,
        replayed: false,
      },
      error: null,
    })
    const body = {
      title: 'Sayılar Ödevi',
      game: 'matematik',
      examRef: 'TYT',
      category: 'Temel',
      difficulty: 2,
      questionCount: 2,
      availableAt: NOW,
      dueAt: DUE,
      requestId: REQUEST_ID,
    }
    const response = await publishAssignment(
      jsonRequest(`/api/teacher/classrooms/${CLASS_ID}/assignments`, body),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )
    expect(response.status).toBe(200)
    expect(questionQuery.eq).toHaveBeenCalledWith('is_active', true)
    expect(questionQuery.eq).toHaveBeenCalledWith('game', 'matematik')
    expect(questionQuery.eq).toHaveBeenCalledWith('exam_ref', 'TYT')
    expect(questionQuery.eq).toHaveBeenCalledWith('category', 'Temel')
    expect(questionQuery.eq).toHaveBeenCalledWith('difficulty', 2)
    const publishPayload = mocks.rpc.mock.calls[0][1]
    expect(publishPayload.p_items).toHaveLength(2)
    expect(publishPayload.p_items.every((item: { questionId: string }) => (
      QUESTION_IDS.includes(item.questionId)
    ))).toBe(true)

    mocks.from.mockClear()
    expect((await publishAssignment(
      jsonRequest(`/api/teacher/classrooms/${CLASS_ID}/assignments`, {
        ...body,
        questionIds: QUESTION_IDS,
      }),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )).status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('lists/reads/submits only the authenticated student assignment and returns zero reward', async () => {
    const finalResult = {
      answeredCount: 1,
      correctCount: 1,
      items: [{ position: 1, selectedOption: 1, isCorrect: true, correctOption: 1 }],
    }
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_my_teacher_assignments') {
        return { data: { assignments: [] }, error: null }
      }
      if (name === 'get_my_teacher_classroom_memberships') {
        return {
          data: {
            classrooms: [{
              id: CLASS_ID,
              name: '12-A Matematik',
              teacherAlias: 'Öğretmen Deniz',
              joinedAt: NOW,
            }],
          },
          error: null,
        }
      }
      if (name === 'get_my_teacher_assignment') {
        return { data: assignment(finalResult), error: null }
      }
      if (name === 'submit_teacher_assignment') {
        return {
          data: {
            assignmentId: ASSIGNMENT_ID,
            answeredCount: 1,
            correctCount: 1,
            replayed: false,
          },
          error: null,
        }
      }
      throw new Error(`unexpected rpc ${name}`)
    })
    expect((await listAssignments(new Request('http://localhost/api/teacher/assignments'))).status)
      .toBe(200)
    const memberships = await listMemberships(
      new Request('http://localhost/api/teacher/memberships'),
    )
    expect(memberships.status).toBe(200)
    expect(JSON.stringify(await memberships.json())).not.toMatch(/studentId|memberRef|email/i)
    expect((await getAssignment(
      new Request(`http://localhost/api/teacher/assignments/${ASSIGNMENT_ID}`),
      { params: Promise.resolve({ assignmentId: ASSIGNMENT_ID }) },
    )).status).toBe(200)
    const submitted = await submitAssignment(
      jsonRequest(`/api/teacher/assignments/${ASSIGNMENT_ID}`, {
        requestId: REQUEST_ID,
        answers: [{ position: 1, selectedOption: 1 }],
      }),
      { params: Promise.resolve({ assignmentId: ASSIGNMENT_ID }) },
    )
    const submittedBody = await submitted.json()
    expect(submitted.status).toBe(200)
    expect(submittedBody.assignment.reward).toEqual({ xp: 0, coins: 0, socialPoints: 0 })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_teacher_assignment', {
      p_user_id: USER_ID,
      p_assignment_id: ASSIGNMENT_ID,
      p_answers: [{ position: 1, selectedOption: 1 }],
      p_request_id: REQUEST_ID,
    })
  })

  it('binds revoke, withdrawal and member removal to strict opaque route identifiers', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'revoke_teacher_classroom_invite') {
        return { data: { inviteRef: INVITE_REF, revokedAt: NOW, replayed: false }, error: null }
      }
      if (name === 'withdraw_teacher_classroom_membership') {
        return {
          data: { classroomId: CLASS_ID, membershipStatus: 'withdrawn', endedAt: NOW, replayed: false },
          error: null,
        }
      }
      if (name === 'remove_teacher_classroom_member') {
        return {
          data: {
            classroomId: CLASS_ID,
            memberRef: INVITE_REF,
            membershipStatus: 'removed',
            endedAt: NOW,
            replayed: false,
          },
          error: null,
        }
      }
      throw new Error(`unexpected rpc ${name}`)
    })
    expect((await revokeInvite(
      jsonRequest(`/api/teacher/invites/${INVITE_REF}`, { requestId: REQUEST_ID }),
      { params: Promise.resolve({ inviteRef: INVITE_REF }) },
    )).status).toBe(200)
    expect((await withdraw(
      jsonRequest(`/api/teacher/classrooms/${CLASS_ID}/withdraw`, { requestId: REQUEST_ID }),
      { params: Promise.resolve({ classroomId: CLASS_ID }) },
    )).status).toBe(200)
    expect((await removeMember(
      jsonRequest(`/api/teacher/classrooms/${CLASS_ID}/members/${INVITE_REF}/remove`, {
        requestId: REQUEST_ID,
      }),
      { params: Promise.resolve({ classroomId: CLASS_ID, memberRef: INVITE_REF }) },
    )).status).toBe(200)
  })
})
