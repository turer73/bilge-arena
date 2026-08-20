import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { mockSignInWithGoogle, mockPush, mockLogConsent } = vi.hoisted(() => ({
  mockSignInWithGoogle: vi.fn(),
  mockPush: vi.fn(),
  mockLogConsent: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/lib/hooks/use-auth', () => ({ useAuth: () => ({ signInWithGoogle: mockSignInWithGoogle }) }))
vi.mock('@/components/layout/logo', () => ({ Logo: () => <div data-testid="logo" /> }))
vi.mock('@/lib/consent', () => ({ logConsent: mockLogConsent }))

import GirisClient from '../giris-client'

describe('GirisClient institution flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/giris')
    mockSignInWithGoogle.mockResolvedValue(undefined)
  })

  it('requires consent and sends institution accounts directly to the institution workspace', async () => {
    render(<GirisClient />)
    const institutionButton = screen.getByRole('button', { name: 'Kurum Hesabıyla Giriş' })
    expect(institutionButton).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(institutionButton)

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith('/arena/kurum'))
    expect(mockLogConsent).toHaveBeenCalledWith('terms', { accepted: true })
    expect(mockLogConsent).toHaveBeenCalledWith('kvkk', { accepted: true })
  })

  it('preserves a safe next path for the regular Google button', async () => {
    window.history.replaceState({}, '', '/giris?next=%2Farena%2Fkurum%2Froller')
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith('/arena/kurum/roller'))
  })
})
