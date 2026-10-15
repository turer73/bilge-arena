import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockRpc, mockSignOut, mockDeleteUser, mockRateCheck } = vi.hoisted(() => ({
  mockGetUser: vi.fn(), mockRpc: vi.fn(), mockSignOut: vi.fn(),
  mockDeleteUser: vi.fn(), mockRateCheck: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser, signOut: mockSignOut },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    rpc: mockRpc,
    auth: { admin: { deleteUser: mockDeleteUser } },
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: mockRateCheck,
  }),
}))

import { POST } from '../delete/route'
import { ACCOUNT_DELETION_CONFIRMATION } from '@/lib/account-deletion'

function deletionRequest(body: unknown = {
  confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: true, expectedUserId: 'u1',
}) {
  return new Request('https://bilgearena.com/api/account/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/account/delete', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({ error: null })
    mockDeleteUser.mockResolvedValue({ data: { user: {} }, error: null })
    mockRateCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(deletionRequest())
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('closes only the authenticated subject, signs out, then explicitly scrubs Auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({})

    const res = await POST(deletionRequest())
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.message).toContain('giriş kimlik bilgileriniz temizlendi')
    expect(json.message).not.toContain('anonimleştirildi')
    expect(json.erasure).toEqual({
      complete: false, profile: 'closed', authIdentity: 'scrubbed',
      relatedRecords: 'pending_retention_review', processorsAndBackups: 'not_verified',
      physicalPurgePerformed: false,
    })
    expect(mockRpc).toHaveBeenCalledWith('soft_delete_user', { p_user_id: 'u1' })
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(mockDeleteUser).toHaveBeenCalledTimes(1)
    expect(mockDeleteUser).toHaveBeenCalledWith('u1', true)
    expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(mockSignOut.mock.invocationCallOrder[0])
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(mockDeleteUser.mock.invocationCallOrder[0])
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('reports cleanup ambiguity when global signOut fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({ error: { message: 'revoke failed' } })

    const res = await POST(deletionRequest())
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('oturum tamamen kapatılamadı') })
    expect(mockDeleteUser).not.toHaveBeenCalled()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns 500 if RPC fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ error: { message: 'DB error' } })

    const res = await POST(deletionRequest())
    expect(res.status).toBe(500)
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it.each(['returned', 'thrown'])('reports partial completion on %s Auth cleanup failure', async (kind) => {
    if (kind === 'returned') mockDeleteUser.mockResolvedValue({ error: { message: 'provider failed' } })
    else mockDeleteUser.mockRejectedValue(new Error('provider failed'))
    const res = await POST(deletionRequest())
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({
      code: 'account_identity_cleanup_pending',
      erasure: { complete: false, profile: 'closed', authIdentity: 'pending' },
    })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it.each([
    { reason: 'rate_limited', expected: 429 },
    { reason: 'backend_unavailable', expected: 503 },
  ])('does not mutate when the limiter refuses: $reason', async ({ reason, expected }) => {
    mockRateCheck.mockResolvedValue({ success: false, reason, retryAfter: 60 })
    const res = await POST(deletionRequest())
    expect(res.status).toBe(expected)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it.each([
    null, [], {},
    { confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: false, expectedUserId: 'u1' },
    { confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: 'true', expectedUserId: 'u1' },
    { confirmation: 'SIL', acknowledged: true, expectedUserId: 'u1' },
    { confirmation: 'hesabimi sil', acknowledged: true, expectedUserId: 'u1' },
    { confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: true },
  ])('does not consume a rate-limit allowance or mutate without deliberate confirmation: %j', async body => {
    const res = await POST(deletionRequest(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'account_deletion_confirmation_required' })
    expect(mockRateCheck).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('refuses empty or invalid JSON instead of falling back to bodyless deletion', async () => {
    const res = await POST(new Request('https://bilgearena.com/api/account/delete', { method: 'POST', body: '{' }))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a confirmation from a different account; never uses the client ID as the subject', async () => {
    const res = await POST(deletionRequest({ confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: true, expectedUserId: 'another-user' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'account_deletion_subject_changed' })
    expect(mockRateCheck).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })
})
