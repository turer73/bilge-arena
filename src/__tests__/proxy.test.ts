import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockPermissionViaRest } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPermissionViaRest: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
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
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
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
})
