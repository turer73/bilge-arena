import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  fetchMemberships: vi.fn(),
  fetchAssignments: vi.fn(),
  withdraw: vi.fn(),
}))
const authState = vi.hoisted(() => ({
  value: { user: { id: 'student-1' }, loading: false },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))
vi.mock('next/navigation', () => ({ usePathname: () => '/arena/sinif' }))
vi.mock('@/lib/teacher-classroom/client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/teacher-classroom/client')>('@/lib/teacher-classroom/client')),
  fetchStudentTeacherMemberships: clientMocks.fetchMemberships,
  fetchStudentTeacherAssignments: clientMocks.fetchAssignments,
  withdrawTeacherClassroom: clientMocks.withdraw,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))

import { StudentClassroomDashboard } from '../student-classroom-dashboard'

const CLASSROOM_ID = '11111111-2222-4333-8444-555555555555'
const ASSIGNMENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('StudentClassroomDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.value = { user: { id: 'student-1' }, loading: false }
    clientMocks.fetchMemberships.mockResolvedValue({
      classrooms: [{
        id: CLASSROOM_ID,
        name: '12-A Matematik',
        teacherAlias: 'Öğretmen 4',
        joinedAt: '2026-08-09T10:00:00.000Z',
      }],
    })
    clientMocks.fetchAssignments.mockResolvedValue({
      assignments: [{
        id: ASSIGNMENT_ID,
        title: 'Kesirler tekrarı',
        status: 'active',
        availableAt: '2026-08-09T10:00:00.000Z',
        dueAt: '2026-08-10T10:00:00.000Z',
        questionCount: 2,
        submittedAt: null,
        classroom: {
          id: CLASSROOM_ID,
          name: '12-A Matematik',
          teacherAlias: 'Öğretmen 4',
        },
      }],
    })
    clientMocks.withdraw.mockResolvedValue({
      classroomId: CLASSROOM_ID,
      membershipStatus: 'withdrawn',
      endedAt: '2026-08-09T12:00:00.000Z',
      replayed: false,
    })
  })

  it('shows only owner memberships and requires inline confirmation before withdrawal', async () => {
    const user = userEvent.setup()
    render(<StudentClassroomDashboard />)

    expect(await screen.findByRole('heading', { name: '12-A Matematik' })).toBeInTheDocument()
    expect(screen.getByText('Kesirler tekrarı')).toBeInTheDocument()
    expect(screen.queryByText('Başka Öğrenci')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Paylaşımı durdur \/ sınıftan ayrıl/i }))
    expect(clientMocks.withdraw).not.toHaveBeenCalled()
    expect(screen.getByText(/Paylaşım hemen durur/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Evet, paylaşımı durdur/i }))
    await waitFor(() => expect(clientMocks.withdraw).toHaveBeenCalledWith(
      CLASSROOM_ID,
      { requestId: expect.any(String) },
    ))
    expect(await screen.findByText(/Henüz aktif bir sınıfa katılmadın/i)).toBeInTheDocument()
    expect(screen.getByText(/Şu anda sana atanmış bir ödev yok/i)).toBeInTheDocument()
  })
})
