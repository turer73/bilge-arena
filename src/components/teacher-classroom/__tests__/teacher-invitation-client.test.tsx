import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  preview: vi.fn(),
  accept: vi.fn(),
}))
const authState = vi.hoisted(() => ({
  value: { user: { id: 'student-1' }, loading: false },
}))
const router = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))
vi.mock('@/lib/teacher-classroom/client', async () => ({
  ...(await vi.importActual<typeof import('@/lib/teacher-classroom/client')>('@/lib/teacher-classroom/client')),
  previewTeacherClassroomInvitation: clientMocks.preview,
  acceptTeacherClassroomInvitation: clientMocks.accept,
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/arena/sinif/davet',
  useRouter: () => router,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}))

import { TeacherInvitationClient } from '../teacher-invitation-client'
import { TEACHER_INVITE_SESSION_KEY } from '@/lib/teacher-classroom/invite-bootstrap'

const TOKEN = 'a'.repeat(43)

describe('TeacherInvitationClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.value = { user: { id: 'student-1' }, loading: false }
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/')
    clientMocks.preview.mockResolvedValue({
      classroomName: '12-A Matematik',
      teacherAlias: 'Öğretmen 4',
      expiresAt: '2026-08-10T10:00:00.000Z',
      notice: { version: 'notice-v1', href: 'https://legal.example/notice' },
      sharingConsent: { version: 'share-v1', href: 'https://legal.example/share' },
    })
    clientMocks.accept.mockResolvedValue({
      classroom: {
        id: '11111111-2222-4333-8444-555555555555',
        name: '12-A Matematik',
        teacherAlias: 'Öğretmen 4',
      },
      membershipStatus: 'active',
      joinedAt: '2026-08-09T11:00:00.000Z',
      replayed: false,
    })
  })

  it('consumes the first-party staged token and requires two separate actions', async () => {
    const user = userEvent.setup()
    window.sessionStorage.setItem(TEACHER_INVITE_SESSION_KEY, TOKEN)
    window.history.replaceState({}, '', '/arena/sinif/davet')

    render(<TeacherInvitationClient />)

    expect(await screen.findByRole('heading', { name: '12-A Matematik' })).toBeInTheDocument()
    expect(screen.getByText(/konu ve kazanım bazlı durum, skor, güven/i)).toBeInTheDocument()
    expect(screen.getByText(/profil UUID.*telefonunu.*XP/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('hâkimiyet verini göremez')
    await waitFor(() => expect(window.location.hash).toBe(''))
    expect(window.sessionStorage.getItem(TEACHER_INVITE_SESSION_KEY)).toBeNull()
    expect(document.body.textContent).not.toContain(TOKEN)
    expect(clientMocks.preview).toHaveBeenCalledWith(TOKEN, expect.any(AbortSignal))

    const notice = screen.getByRole('checkbox', { name: /Aydınlatma metnini okudum/i })
    const consent = screen.getByRole('checkbox', { name: /açık rıza veriyorum/i })
    const submit = screen.getByRole('button', { name: 'Sınıfa katıl' })
    expect(notice).not.toBeChecked()
    expect(consent).not.toBeChecked()
    expect(submit).toBeDisabled()

    await user.click(notice)
    expect(submit).toBeDisabled()
    await user.click(consent)
    expect(submit).toBeEnabled()
    await user.click(submit)

    await waitFor(() => expect(clientMocks.accept).toHaveBeenCalledWith(expect.objectContaining({
      token: TOKEN,
      noticeVersion: 'notice-v1',
      noticeAcknowledged: true,
      sharingConsentVersion: 'share-v1',
      sharingConsent: true,
      requestId: expect.any(String),
    })))
    expect(await screen.findByRole('heading', { name: 'Sınıfa katıldın' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(TOKEN)
  })
})
