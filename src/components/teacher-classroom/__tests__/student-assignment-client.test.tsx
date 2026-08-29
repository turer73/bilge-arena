import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  fetchAssignment: vi.fn(),
  submitAssignment: vi.fn(),
  fetchBilgeTahtaAccess: vi.fn(),
}))
const authState = vi.hoisted(() => ({
  value: { user: { id: 'student-1' }, loading: false },
}))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))
vi.mock('next/navigation', () => ({ usePathname: () => '/arena/sinif' }))
vi.mock('@/lib/teacher-classroom/client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/teacher-classroom/client')>('@/lib/teacher-classroom/client')),
  fetchStudentTeacherAssignment: clientMocks.fetchAssignment,
  submitStudentTeacherAssignment: clientMocks.submitAssignment,
  fetchClassroomBilgeTahtaAccess: clientMocks.fetchBilgeTahtaAccess,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))

import { StudentAssignmentClient } from '../student-assignment-client'
import type { StudentTeacherAssignment } from '@/lib/teacher-classroom/server-contract'

const ASSIGNMENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CLASSROOM_ID = '11111111-2222-4333-8444-555555555555'

const activeAssignment: StudentTeacherAssignment = {
  id: ASSIGNMENT_ID,
  title: 'Kesirler tekrarı',
  status: 'active',
  availableAt: '2026-08-09T10:00:00.000Z',
  dueAt: '2026-08-10T10:00:00.000Z',
  classroom: {
    id: CLASSROOM_ID,
    name: '12-A Matematik',
    teacherAlias: 'Öğretmen 4',
  },
  items: [
    {
      position: 1,
      question: {
        game: 'matematik',
        category: 'Sayılar',
        topic: 'Toplama',
        difficulty: 1,
        content: { question: '1 + 1 kaçtır?', options: ['2', '3'] },
      },
    },
    {
      position: 2,
      question: {
        game: 'matematik',
        category: 'Sayılar',
        topic: 'Çıkarma',
        difficulty: 1,
        content: { question: '5 - 2 kaçtır?', options: ['2', '3'] },
      },
    },
  ],
  result: null,
  reward: { xp: 0, coins: 0, socialPoints: 0 },
}

const submittedAssignment: StudentTeacherAssignment = {
  ...activeAssignment,
  status: 'submitted',
  result: {
    answeredCount: 1,
    correctCount: 1,
    items: [
      { position: 1, selectedOption: 0, isCorrect: true, correctOption: 0 },
      { position: 2, selectedOption: null, isCorrect: null, correctOption: 1 },
    ],
  },
}

describe('StudentAssignmentClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.value = { user: { id: 'student-1' }, loading: false }
    clientMocks.fetchAssignment.mockResolvedValue(activeAssignment)
    clientMocks.fetchBilgeTahtaAccess.mockResolvedValue({ enabled: true })
    clientMocks.submitAssignment.mockResolvedValue({
      assignment: submittedAssignment,
      replayed: false,
    })
  })

  it('uses native radio groups and requires a separate final-submit confirmation', async () => {
    const user = userEvent.setup()
    render(<StudentAssignmentClient assignmentId={ASSIGNMENT_ID} />)

    expect(await screen.findByRole('heading', { name: 'Kesirler tekrarı' })).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(6)
    expect(radios.every((radio) => radio.getAttribute('type') === 'radio')).toBe(true)
    expect(screen.getByText(/XP, coin, görev, seri ve sıralama puanı üretilmez/i)).toBeInTheDocument()

    await user.click(screen.getAllByRole('radio', { name: /A\.\s*2/ })[0]!)
    await user.click(screen.getByRole('button', { name: 'Teslimi gözden geçir' }))
    expect(clientMocks.submitAssignment).not.toHaveBeenCalled()
    expect(screen.getByText(/Bu teslim finaldir/i)).toBeInTheDocument()
    expect(screen.getByText('1/2 yanıt · 1 boş')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Final teslimi yap' }))
    await waitFor(() => expect(clientMocks.submitAssignment).toHaveBeenCalledWith(
      ASSIGNMENT_ID,
      {
        requestId: expect.any(String),
        answers: [
          { position: 1, selectedOption: 0 },
          { position: 2, selectedOption: null },
        ],
      },
    ))
    expect(await screen.findByText('1/2')).toBeInTheDocument()
    expect(document.body).toHaveTextContent('Doğru · Doğru cevap A')
    expect(document.body).toHaveTextContent('Boş bırakıldı · Doğru cevap B')
    expect(screen.queryByRole('button', { name: 'Final teslimi yap' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Konu Anlatımı' })).toHaveLength(2)
  })
})
