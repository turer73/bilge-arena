import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockGetAal, mockPermissionViaRest, mockCookieRefresh } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetAal: vi.fn(),
  mockPermissionViaRest: vi.fn(),
  mockCookieRefresh: { enabled: false },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url, _key, options) => ({
    auth: {
      getUser: async () => {
        if (mockCookieRefresh.enabled) {
          options.cookies.setAll([{
            name: 'sb-access-token', value: 'refreshed', options: { path: '/', httpOnly: true },
          }])
        }
        return mockGetUser()
      },
      mfa: { getAuthenticatorAssuranceLevel: mockGetAal },
    },
  })),
}))

vi.mock('@/lib/supabase/platform-access', () => ({
  userHasAnyPlatformPermissionViaRest: mockPermissionViaRest,
}))

import { proxy } from '@/proxy'

function request(path = '/admin') {
  return new NextRequest(`https://bilgearena.com${path}`)
}

describe('admin proxy permission boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCookieRefresh.enabled = false
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mockGetAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
  })

  it('redirects an unauthenticated request to login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await proxy(request())
    expect(response.headers.get('location')).toBe('https://bilgearena.com/giris')
    expect(mockPermissionViaRest).not.toHaveBeenCalled()
  })

  it('redirects a pilot-only user from admin to the institution workspace', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockPermissionViaRest
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const response = await proxy(request())
    expect(response.headers.get('location')).toBe('https://bilgearena.com/arena/kurum')
  })

  it('allows a user carrying a real platform admin entry permission', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockPermissionViaRest.mockResolvedValueOnce(true)

    const response = await proxy(request('/admin/kurumlar'))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('fails closed to the arena when permission checks fail', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockPermissionViaRest.mockResolvedValue(false)

    const response = await proxy(request())
    expect(response.headers.get('location')).toBe('https://bilgearena.com/arena')
  })

  it('redirects an AAL1 admin session to TOTP verification before permission lookup', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockGetAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })

    const response = await proxy(request('/admin/kurumlar'))
    expect(response.headers.get('location')).toBe(
      'https://bilgearena.com/hesap/guvenlik?next=%2Fadmin%2Fkurumlar',
    )
    expect(mockPermissionViaRest).not.toHaveBeenCalled()
  })

  it('preserves refreshed auth cookies on an AAL1 redirect response', async () => {
    mockCookieRefresh.enabled = true
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockGetAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })

    const response = await proxy(request('/admin/kurumlar'))

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed')
    expect(response.headers.get('location')).toContain('/hesap/guvenlik')
  })
})
