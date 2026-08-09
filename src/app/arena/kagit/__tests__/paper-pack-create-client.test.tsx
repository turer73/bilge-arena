import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaperPackCreateClient } from '../paper-pack-create-client'
import { issuePaperPack } from '@/lib/paper-mode/client'
import { useAuthStore } from '@/stores/auth-store'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={String(href)} {...props}>{children}</a> }))
vi.mock('@/lib/paper-mode/client', () => ({ issuePaperPack: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: vi.fn() }))

const issueMock = vi.mocked(issuePaperPack)
const authMock = vi.mocked(useAuthStore)
const PACK_ID = '11111111-2222-4333-8444-555555555555'

describe('PaperPackCreateClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockReturnValue({ user: { id: 'owner' }, loading: false } as never)
  })

  it('requires an authenticated owner', () => {
    authMock.mockReturnValue({ user: null, loading: false } as never)
    render(<PaperPackCreateClient game="matematik" examRef="TYT" />)
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/giris')
    expect(issueMock).not.toHaveBeenCalled()
  })

  it('reuses the issue request id on retry and opens the canonical pack', async () => {
    issueMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        packId: PACK_ID,
        status: 'active',
        createdAt: '2026-08-09T10:00:00.000+00:00',
        expiresAt: '2026-08-16T10:00:00.000+00:00',
        itemCount: 15,
        replayed: true,
      })
    render(<PaperPackCreateClient game="matematik" examRef="TYT" />)
    fireEvent.click(screen.getByRole('button', { name: /Bugünkü paketi hazırla/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Aynı isteği yeniden dene/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/arena/kagit/${PACK_ID}`))
    expect(issueMock).toHaveBeenCalledTimes(2)
    expect(issueMock.mock.calls[0][0].requestId).toBe(issueMock.mock.calls[1][0].requestId)
    expect(issueMock.mock.calls[1][0]).toMatchObject({ game: 'matematik', examRef: 'TYT' })
  })
})
