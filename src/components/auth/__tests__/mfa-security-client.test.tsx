import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  const refresh = vi.fn()
  return {
    replace,
    refresh,
    router: { replace, refresh },
    getUser: vi.fn(),
    getAal: vi.fn(),
    listFactors: vi.fn(),
    enroll: vi.fn(),
    unenroll: vi.fn(),
    challengeAndVerify: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.getAal,
        listFactors: mocks.listFactors,
        enroll: mocks.enroll,
        unenroll: mocks.unenroll,
        challengeAndVerify: mocks.challengeAndVerify,
      },
    },
  }),
}))

import { MfaSecurityClient } from '../mfa-security-client'

describe('MfaSecurityClient recovery flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    mocks.listFactors.mockResolvedValue({ data: { all: [], totp: [], phone: [] }, error: null })
  })

  it('preserves the original admin target across a fresh login', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    render(<MfaSecurityClient returnPath="/admin/kurumlar" />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      '/giris?next=%2Fhesap%2Fguvenlik%3Fnext%3D%252Fadmin%252Fkurumlar',
    ))
  })

  it('lets the user clear an unfinished TOTP enrollment without disabling AAL2', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [{ id: 'factor-1', factor_type: 'totp', status: 'unverified' }],
        totp: [],
        phone: [],
      },
      error: null,
    })
    mocks.unenroll.mockResolvedValue({ data: {}, error: null })

    render(<MfaSecurityClient returnPath="/admin" />)
    const reset = await screen.findByRole('button', { name: 'Yarım kalan kurulumu sıfırla' })
    fireEvent.click(reset)

    await waitFor(() => expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' }))
    expect(await screen.findByRole('button', { name: 'Doğrulamayı kur' })).toBeInTheDocument()
  })
})

describe('MfaSecurityClient AAL2 kapisi', () => {
  const verifiedFactor = {
    data: {
      all: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
      totp: [{ id: 'factor-1', status: 'verified' }],
      phone: [],
    },
    error: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    mocks.listFactors.mockResolvedValue(verifiedFactor)
  })

  it('kullaniciya hangi kapiya takildigini soyler', async () => {
    render(<MfaSecurityClient returnPath="/admin/sorular" />)
    expect(await screen.findByText(/Yönetim paneline/)).toBeInTheDocument()
  })

  it('kurum paneli hedefini de adiyla gosterir', async () => {
    render(<MfaSecurityClient returnPath="/arena/kurum" />)
    expect(await screen.findByText(/Kurum paneline/)).toBeInTheDocument()
  })

  it('dogrulama sonrasi tam sayfa gezinme yapar (soft nav eski cerezi tasir)', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    })
    mocks.challengeAndVerify.mockResolvedValue({ data: {}, error: null })

    render(<MfaSecurityClient returnPath="/admin" />)
    const input = await screen.findByLabelText(/6 haneli doğrulama kodu/)
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Doğrula ve devam et/ }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin'))
    expect(mocks.replace).not.toHaveBeenCalledWith('/admin')
  })
})
