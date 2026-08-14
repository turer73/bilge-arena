import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), open: vi.fn(), resolve: vi.fn() }))
vi.mock('@/lib/institution-tracking/client', () => ({
  fetchInstitutionStudentFollowups: mocks.fetch,
  openInstitutionStudentFollowup: mocks.open,
  resolveInstitutionStudentFollowup: mocks.resolve,
  InstitutionTrackingClientError: class InstitutionTrackingClientError extends Error {
    constructor(readonly status: number) { super(`institution_tracking_request_${status}`) }
  },
}))

import { StudentFollowupPanel } from '../student-followup-panel'

const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_REF = 'a'.repeat(32)
const FOLLOWUP_REF = 'd'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetch.mockResolvedValue({ followups: [] })
  mocks.open.mockResolvedValue({ followupRef: FOLLOWUP_REF, reasonCode: 'support_needed', status: 'open', openedAt: '2026-08-14T09:00:00.000Z', resolvedAt: null, replayed: false })
  mocks.resolve.mockResolvedValue({ followupRef: FOLLOWUP_REF, reasonCode: 'support_needed', status: 'resolved', openedAt: '2026-08-14T09:00:00.000Z', resolvedAt: '2026-08-14T10:00:00.000Z', replayed: false })
})

describe('StudentFollowupPanel', () => {
  it.each([320, 375, 390])('opens and closes a minimal teacher follow-up at %ipx', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    const changed = vi.fn()
    const user = userEvent.setup()
    render(<StudentFollowupPanel classroomId={CLASSROOM_ID} memberRef={MEMBER_REF} onChanged={changed} />)
    expect(await screen.findByText('Bu öğrenci için açık destek takibi yok.')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/Cuma günü programı/i), 'Cuma günü programı birlikte gözden geçirilecek.')
    await user.click(screen.getByRole('button', { name: 'Takip aç' }))
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({
      classroomId: CLASSROOM_ID, memberRef: MEMBER_REF, reasonCode: 'support_needed',
    }))
    expect(await screen.findByText('Cuma günü programı birlikte gözden geçirilecek.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Takibi kapat' }))
    expect(mocks.resolve).toHaveBeenCalledWith(FOLLOWUP_REF)
    expect(await screen.findByText('Bu öğrenci için açık destek takibi yok.')).toBeInTheDocument()
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('does not display opaque refs or classroom ids', async () => {
    const { container } = render(<StudentFollowupPanel classroomId={CLASSROOM_ID} memberRef={MEMBER_REF} />)
    await screen.findByText('Bu öğrenci için açık destek takibi yok.')
    expect(container.textContent).not.toContain(CLASSROOM_ID)
    expect(container.textContent).not.toContain(MEMBER_REF)
  })
})
