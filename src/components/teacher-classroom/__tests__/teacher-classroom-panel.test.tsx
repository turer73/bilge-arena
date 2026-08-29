import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  fetchClasses: vi.fn(),
  fetchOverview: vi.fn(),
  fetchBilgeTahtaAccess: vi.fn(),
  fetchExamMode: vi.fn(),
  updateExamMode: vi.fn(),
  updateBilgeTahtaAccess: vi.fn(),
  createClass: vi.fn(),
  issueInvite: vi.fn(),
  revokeInvite: vi.fn(),
  publishAssignment: vi.fn(),
  removeMember: vi.fn(),
}))
const authState = vi.hoisted(() => ({
  value: { user: { id: 'teacher-1' }, loading: false },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))
vi.mock('next/navigation', () => ({ usePathname: () => '/arena/sinif' }))
vi.mock('@/lib/teacher-classroom/client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/teacher-classroom/client')>('@/lib/teacher-classroom/client')),
  fetchTeacherClassrooms: clientMocks.fetchClasses,
  fetchTeacherClassroomOverview: clientMocks.fetchOverview,
  fetchClassroomBilgeTahtaAccess: clientMocks.fetchBilgeTahtaAccess,
  fetchClassroomExamMode: clientMocks.fetchExamMode,
  updateClassroomExamMode: clientMocks.updateExamMode,
  updateClassroomBilgeTahtaAccess: clientMocks.updateBilgeTahtaAccess,
  createTeacherClassroom: clientMocks.createClass,
  issueTeacherClassroomInvite: clientMocks.issueInvite,
  revokeTeacherClassroomInvite: clientMocks.revokeInvite,
  publishTeacherAssignment: clientMocks.publishAssignment,
  removeTeacherClassroomMember: clientMocks.removeMember,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))

import { TeacherClassroomPanel } from '../teacher-classroom-panel'
import { TeacherClassroomClientError } from '@/lib/teacher-classroom/client'
import type {
  TeacherClassroomList,
  TeacherClassroomOverview,
} from '@/lib/teacher-classroom/server-contract'

const CLASSROOM_ID = '11111111-2222-4333-8444-555555555555'
const ASSIGNMENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const MEMBER_REF = 'c'.repeat(32)
const TOKEN = 'b'.repeat(43)

const classes: TeacherClassroomList = {
  classrooms: [{
    id: CLASSROOM_ID,
    name: '12-A Matematik',
    status: 'active',
    activeStudentCount: 1,
    assignmentCount: 1,
    createdAt: '2026-08-09T09:00:00.000Z',
  }],
}

const overview: TeacherClassroomOverview = {
  classroom: {
    id: CLASSROOM_ID,
    name: '12-A Matematik',
    status: 'active',
    activeStudentCount: 1,
    hiddenRecipientCount: 1,
    createdAt: '2026-08-09T09:00:00.000Z',
  },
  activeStudents: [{
    memberRef: MEMBER_REF,
    alias: 'Öğrenci 7',
    joinedAt: '2026-08-09T10:00:00.000Z',
  }],
  assignments: [{
    id: ASSIGNMENT_ID,
    title: 'Eski ödev',
    status: 'published',
    availableAt: '2026-08-09T10:00:00.000Z',
    dueAt: '2026-08-10T10:00:00.000Z',
    questionCount: 2,
    assignedCount: 2,
    submittedCount: 1,
    students: [{
      memberRef: MEMBER_REF,
      alias: 'Öğrenci 7',
      status: 'submitted',
      answeredCount: 2,
      correctCount: 1,
      submittedAt: '2026-08-09T11:00:00.000Z',
    }],
  }],
}

describe('TeacherClassroomPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.value = { user: { id: 'teacher-1' }, loading: false }
    clientMocks.fetchClasses.mockResolvedValue(classes)
    clientMocks.fetchOverview.mockResolvedValue(overview)
    clientMocks.fetchBilgeTahtaAccess.mockResolvedValue({ enabled: false })
    clientMocks.fetchExamMode.mockResolvedValue({ classroomId: 'class-1', examMode: false, until: null })
    clientMocks.updateBilgeTahtaAccess.mockResolvedValue({
      classroomId: CLASSROOM_ID,
      enabled: true,
      replayed: false,
    })
    clientMocks.issueInvite.mockResolvedValue({
      inviteRef: 'f'.repeat(32),
      expiresAt: '2026-08-10T10:00:00.000Z',
      maxUses: 10,
      usedCount: 0,
      replayed: false,
      token: TOKEN,
      sharePath: `/arena/sinif/davet#token=${TOKEN}`,
    })
    clientMocks.publishAssignment.mockResolvedValue({
      assignmentId: 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb',
      status: 'published',
      availableAt: '2026-08-09T10:00:00.000Z',
      dueAt: '2026-08-10T10:00:00.000Z',
      questionCount: 10,
      recipientCount: 1,
      replayed: false,
    })
  })

  it('renders only minimum aggregates and publishes server-filtered work without question ids', async () => {
    const user = userEvent.setup()
    render(<TeacherClassroomPanel />)

    expect(await screen.findByRole('heading', { name: '12-A Matematik' })).toBeInTheDocument()
    expect(screen.getAllByText('Öğrenci 7').length).toBeGreaterThan(0)
    expect(screen.getByText('2 yanıt · 1 doğru')).toBeInTheDocument()
    expect(screen.getByText(/1 geçmiş\/gizli üyelik kimliği/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/student-1|@|11111111-2222/)

    const bilgeTahtaSwitch = screen.getByRole('switch', { name: 'Sınıf Bilge Tahta' })
    expect(bilgeTahtaSwitch).toHaveAttribute('aria-checked', 'false')
    await user.click(bilgeTahtaSwitch)
    await waitFor(() => expect(clientMocks.updateBilgeTahtaAccess).toHaveBeenCalledWith(
      CLASSROOM_ID,
      { enabled: true, requestId: expect.any(String) },
    ))
    expect(screen.getByRole('switch', { name: 'Sınıf Bilge Tahta' })).toHaveAttribute('aria-checked', 'true')

    expect(document.body.textContent).not.toContain(TOKEN)
    await user.click(screen.getByRole('button', { name: 'Davet oluştur' }))
    expect(await screen.findByText(new RegExp(TOKEN))).toBeInTheDocument()

    await user.type(screen.getByLabelText('Ödev başlığı'), 'Yeni kesir ödevi')
    await user.click(screen.getByRole('button', { name: 'Aktif öğrencilere yayımla' }))
    await waitFor(() => expect(clientMocks.publishAssignment).toHaveBeenCalledTimes(1))

    const [classroomId, input] = clientMocks.publishAssignment.mock.calls[0]
    expect(classroomId).toBe(CLASSROOM_ID)
    expect(input).toMatchObject({
      title: 'Yeni kesir ödevi',
      game: 'matematik',
      examRef: 'TYT',
      questionCount: 10,
      requestId: expect.any(String),
      availableAt: expect.any(String),
      dueAt: expect.any(String),
    })
    expect(input).not.toHaveProperty('questionIds')
    expect(input).not.toHaveProperty('items')
    expect(input).not.toHaveProperty('answers')
  })

  it('shows a closed role gate when the pilot permission is missing', async () => {
    clientMocks.fetchClasses.mockRejectedValue(new TeacherClassroomClientError(403))
    render(<TeacherClassroomPanel />)

    expect(await screen.findByRole('heading', { name: 'Pilot öğretmen yetkisi gerekli' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).not.toBeInTheDocument()
  })
})
