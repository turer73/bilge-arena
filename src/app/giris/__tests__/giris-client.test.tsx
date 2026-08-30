import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { mockSignInWithGoogle, mockPush, mockBeginLegalConsentIntent } = vi.hoisted(() => ({
  mockSignInWithGoogle: vi.fn(),
  mockPush: vi.fn(),
  mockBeginLegalConsentIntent: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/lib/hooks/use-auth', () => ({ useAuth: () => ({ signInWithGoogle: mockSignInWithGoogle }) }))
vi.mock('@/components/layout/logo', () => ({ Logo: () => <div data-testid="logo" /> }))
vi.mock('@/lib/consent', () => ({ beginLegalConsentIntent: mockBeginLegalConsentIntent }))

import GirisClient from '../giris-client'

describe('GirisClient institution flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/giris')
    mockSignInWithGoogle.mockResolvedValue(undefined)
    mockBeginLegalConsentIntent.mockResolvedValue('legal-intent-token')
  })

  it('requires consent and sends institution accounts directly to the institution workspace', async () => {
    render(<GirisClient />)
    const institutionButton = screen.getByRole('button', { name: 'Kurum Hesabıyla Giriş' })
    expect(institutionButton).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(institutionButton)

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/arena/kurum',
      { forceAccountSelection: true, legalConsentToken: 'legal-intent-token' },
    ))
  })

  it('preserves a safe next path for the regular Google button', async () => {
    window.history.replaceState({}, '', '/giris?next=%2Farena%2Fkurum%2Froller')
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/arena/kurum/roller',
      { legalConsentToken: 'legal-intent-token' },
    ))
  })

  it('preserves a safe legacy redirect path for regular user registration', async () => {
    window.history.replaceState({}, '', '/giris?redirect=%2Farena%2Fmatematik')
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/arena/matematik',
      { legalConsentToken: 'legal-intent-token' },
    ))
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

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/arena/turkce',
      { legalConsentToken: 'legal-intent-token' },
    ))
  })

  it('rejects an unsafe legacy redirect target for regular user registration', async () => {
    window.history.replaceState({}, '', '/giris?redirect=https%3A%2F%2Fevil.example')
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/arena',
      { legalConsentToken: 'legal-intent-token' },
    ))
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
      { forceAccountSelection: true, legalConsentToken: 'legal-intent-token' },
    ))
  })

  it('onay niyeti olusturulamazsa OAuth baslatmaz ve hatayi gosterir', async () => {
    mockBeginLegalConsentIntent.mockRejectedValueOnce(new Error('backend unavailable'))
    render(<GirisClient />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Onay kaydı hazırlanamadı')
    expect(mockSignInWithGoogle).not.toHaveBeenCalled()
  })

  it('callback hukuki kaniti reddettiginde yeniden onay istemini aciklar', () => {
    render(<GirisClient initialConsentError="Giriş onayı doğrulanamadı veya süresi doldu." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Giriş onayı doğrulanamadı')
  })

  it('silinmis profil icin farkli hesap secimini zorunlu tutar', async () => {
    render(<GirisClient initialAccountNotice={{
      kind: 'deleted',
      message: 'Bu hesabın uygulama profili kapatılmıştır.',
    }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('uygulama profili kapatılmıştır')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Google ile Giriş Yap' }))

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledWith(
      '/arena',
      { forceAccountSelection: true, legalConsentToken: 'legal-intent-token' },
    ))
  })

  it('hesap durumu dogrulanamazsa yeni OAuth girisini fail-closed durdurur', () => {
    render(<GirisClient initialAccountNotice={{
      kind: 'unavailable',
      message: 'Hesap durumu şu anda doğrulanamıyor.',
    }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Hesap durumu şu anda doğrulanamıyor')
    expect(screen.getByRole('button', { name: 'Google ile Giriş Yap' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Kurum Hesabıyla Giriş' })).toBeDisabled()
  })
})
