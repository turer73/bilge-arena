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

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/arena/kurum',
      { forceAccountSelection: true },
    ))
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

  it('preserves a safe legacy redirect path for regular user registration', async () => {
    window.history.replaceState({}, '', '/giris?redirect=%2Farena%2Fmatematik')
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith('/arena/matematik'))
  })

  it('prefers canonical next over a legacy redirect target', async () => {
    window.history.replaceState(
      {},
      '',
      '/giris?next=%2Farena%2Fturkce&redirect=https%3A%2F%2Fevil.example',
    )
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith('/arena/turkce'))
  })

  it('rejects an unsafe legacy redirect target for regular user registration', async () => {
    window.history.replaceState({}, '', '/giris?redirect=https%3A%2F%2Fevil.example')
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith('/arena'))
  })

  it('preserves the nested MFA target when institution account selection is forced', async () => {
    window.history.replaceState(
      {},
      '',
      '/giris?next=%2Fhesap%2Fguvenlik%3Fnext%3D%252Fadmin%252Fkurumlar',
    )
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Kurum Hesabıyla Giriş' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/hesap/guvenlik?next=%2Fadmin%2Fkurumlar',
      { forceAccountSelection: true },
    ))
  })
})
