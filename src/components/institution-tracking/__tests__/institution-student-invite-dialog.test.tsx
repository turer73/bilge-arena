import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  issueInvite: vi.fn(),
  revokeInvite: vi.fn(),
}))

vi.mock('@/lib/teacher-classroom/client', () => ({
  issueTeacherClassroomInvite: clientMocks.issueInvite,
  revokeTeacherClassroomInvite: clientMocks.revokeInvite,
}))

import { InstitutionStudentInviteDialog } from '../institution-student-invite-dialog'

const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const INVITE_REF = 'f'.repeat(32)
const TOKEN = 'b'.repeat(43)

describe('InstitutionStudentInviteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '11111111-1111-4111-8111-111111111111') })
    clientMocks.issueInvite.mockResolvedValue({
      inviteRef: INVITE_REF,
      expiresAt: '2026-08-21T12:00:00.000Z',
      maxUses: 10,
      usedCount: 0,
      replayed: false,
      token: TOKEN,
      sharePath: `/arena/sinif/davet#token=${TOKEN}`,
    })
    clientMocks.revokeInvite.mockResolvedValue({
      inviteRef: INVITE_REF,
      revokedAt: '2026-08-20T12:00:00.000Z',
      replayed: false,
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('creates, copies and revokes a bounded classroom invite', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(
      <InstitutionStudentInviteDialog
        classroomId={CLASSROOM_ID}
        classroomName="TYT Matematik A"
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'TYT Matematik A' })).toBeInTheDocument()
    expect(screen.getByText(/aydınlatma ve ilerleme paylaşımı/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Davet bağlantısı oluştur' }))

    await waitFor(() => expect(clientMocks.issueInvite).toHaveBeenCalledWith(
      CLASSROOM_ID,
      expect.objectContaining({
        maxUses: 10,
        requestId: '11111111-1111-4111-8111-111111111111',
        expiresAt: expect.any(String),
      }),
    ))
    const shareUrl = `${window.location.origin}/arena/sinif/davet#token=${TOKEN}`
    expect(screen.getByText(shareUrl)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bağlantıyı kopyala' }))
    expect(writeText).toHaveBeenCalledWith(shareUrl)
    expect(await screen.findByRole('status')).toHaveTextContent('WhatsApp veya e-postayla paylaşabilirsiniz')

    await user.click(screen.getByRole('button', { name: 'Daveti iptal et' }))
    await waitFor(() => expect(clientMocks.revokeInvite).toHaveBeenCalledWith(
      INVITE_REF,
      { requestId: '11111111-1111-4111-8111-111111111111' },
    ))
    expect(screen.getByRole('status')).toHaveTextContent('Davet iptal edildi')
  })

  it('closes with Escape and restores focus to the launcher', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    const launcher = document.createElement('button')
    launcher.textContent = 'Öğrenci ekle'
    document.body.appendChild(launcher)
    launcher.focus()

    const { unmount } = render(
      <InstitutionStudentInviteDialog
        classroomId={CLASSROOM_ID}
        classroomName="TYT Matematik A"
        open
        onOpenChange={onOpenChange}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    unmount()
    expect(launcher).toHaveFocus()
    launcher.remove()
  })
})
