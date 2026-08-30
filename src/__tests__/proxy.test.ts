import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockGetAal, mockPermissionViaRest, mockProfileAccessViaRest, mockCookieRefresh } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetAal: vi.fn(),
  mockPermissionViaRest: vi.fn(),
  mockProfileAccessViaRest: vi.fn(),
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
  getUserProfileAccessStateViaRest: mockProfileAccessViaRest,
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
    mockProfileAccessViaRest.mockResolvedValue('active')
    mockGetAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
  })

  it('redirects an unauthenticated request to login without losing the admin target', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const response = await proxy(request('/admin/kurumlar?tab=active'))
    expect(response.headers.get('location')).toBe(
      'https://bilgearena.com/giris?next=%2Fadmin%2Fkurumlar%3Ftab%3Dactive',
    )
    expect(mockPermissionViaRest).not.toHaveBeenCalled()
  })

  it('preserves encoded admin query values and refreshed cookies on the login redirect', async () => {
    mockCookieRefresh.enabled = true
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(request('/admin/kurumlar?tab=active&filter=a%2Fb'))
    const location = new URL(response.headers.get('location')!)

    expect(location.pathname).toBe('/giris')
    expect(location.searchParams.get('next')).toBe('/admin/kurumlar?tab=active&filter=a%2Fb')
    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed')
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
    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'")
    expect(csp).not.toMatch(/googlesyndication|googletagmanager|analytics\.panola|plausible/i)
  })

  it('does not add the private nonce policy to a public document', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await proxy(request('/arena'))

    expect(response.headers.get('Content-Security-Policy')).toBeNull()
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

  it('redirects a tombstoned account before AAL2 or permission checks', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockProfileAccessViaRest.mockResolvedValue('deleted')

    const response = await proxy(request('/admin/kurumlar'))
    expect(response.headers.get('location')).toBe('https://bilgearena.com/giris?deleted=1')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mockGetAal).not.toHaveBeenCalled()
    expect(mockPermissionViaRest).not.toHaveBeenCalled()
  })

  it('returns no-store 410 for tombstoned API requests, except account deletion', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockProfileAccessViaRest.mockResolvedValue('deleted')

    const response = await proxy(request('/api/profile'))
    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ code: 'account_deleted' })
    expect(mockGetAal).not.toHaveBeenCalled()

    mockProfileAccessViaRest.mockClear()
    const deletionResponse = await proxy(request('/api/account/delete'))
    expect(deletionResponse.headers.get('x-middleware-next')).toBe('1')
    expect(mockProfileAccessViaRest).not.toHaveBeenCalled()
  })

  it('renders login once and clears a tombstoned auth cookie instead of redirect looping', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockProfileAccessViaRest.mockResolvedValue('deleted')
    const deletedRequest = new NextRequest('https://bilgearena.com/giris?deleted=1', {
      headers: { cookie: 'sb-project-auth-token=stale' },
    })

    const response = await proxy(deletedRequest)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.cookies.get('sb-project-auth-token')?.value).toBe('')
  })

  it('does not label an operational profile-check failure as account deletion', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } })
    mockProfileAccessViaRest.mockResolvedValue('unavailable')

    const apiResponse = await proxy(request('/api/profile'))
    expect(apiResponse.status).toBe(503)
    expect(await apiResponse.json()).toMatchObject({ code: 'account_access_unavailable' })

    const pageResponse = await proxy(request('/arena'))
    expect(pageResponse.headers.get('location')).toBe(
      'https://bilgearena.com/giris?error=account_unavailable',
    )
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
