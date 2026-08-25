import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  logAdminAction: vi.fn(),
  rpc: vi.fn(),
  limiter: vi.fn(),
  freePilotEnabled: vi.fn(),
  pilotEnabled: vi.fn(),
}))

vi.mock('@/lib/institution-pilot/server-security', () => ({
  isInstitutionFreePilotEnabled: mocks.freePilotEnabled,
  isInstitutionPilotEnabled: mocks.pilotEnabled,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ marker: 'cookie', rpc: mocks.rpc })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mocks.checkPermission,
  logAdminAction: mocks.logAdminAction,
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: mocks.limiter }),
}))

import { POST } from '../route'

const ADMIN = { id: '11111111-1111-4111-8111-111111111111' }
const MANAGER_ID = '22222222-2222-4222-8222-222222222222'
const INSTITUTION_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'
const CREATED_AT = '2026-08-25T10:00:00.000Z'
const REVIEW_DUE_AT = '2026-09-24T10:00:00.000Z'

function post(body: unknown) {
  return new Request('http://localhost/api/admin/institutions/free-pilots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

const input = {
  name: 'Bilge Eğitim Merkezi',
  managerUserId: MANAGER_ID,
  approvalReference: 'PILOT-2026-001',
  studentLimit: 30,
  staffLimit: 2,
  trialDays: 30,
  requestId: REQUEST_ID,
}

const result = {
  institution: {
    id: INSTITUTION_ID,
    name: input.name,
    status: 'pilot',
    studentLimit: 30,
    staffLimit: 2,
    pilotKind: 'invitation_free',
    approvalReference: input.approvalReference,
    reviewDueAt: REVIEW_DUE_AT,
    createdAt: CREATED_AT,
  },
  membership: { memberRef: 'a'.repeat(32), role: 'manager', joinedAt: CREATED_AT },
  replayed: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.freePilotEnabled.mockReturnValue(true)
  mocks.pilotEnabled.mockReturnValue(true)
  mocks.checkPermission.mockResolvedValue(ADMIN)
  mocks.limiter.mockResolvedValue({ success: true })
  mocks.rpc.mockResolvedValue({ data: result, error: null })
  mocks.logAdminAction.mockResolvedValue({ error: null })
})

describe('admin invitation-only free institution pilot route', () => {
  it('fails closed before authentication when its dedicated switch is off', async () => {
    mocks.freePilotEnabled.mockReturnValue(false)

    const response = await POST(post(input))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Ücretsiz kurum pilotu kapalı' })
    expect(mocks.checkPermission).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('also requires the institution platform switch and management permission', async () => {
    mocks.pilotEnabled.mockReturnValue(false)
    expect((await POST(post(input))).status).toBe(503)
    expect(mocks.checkPermission).not.toHaveBeenCalled()

    mocks.pilotEnabled.mockReturnValue(true)
    mocks.checkPermission.mockResolvedValue(null)
    expect((await POST(post(input))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects excessive quotas, duration and unknown fields before RPC execution', async () => {
    const response = await POST(post({
      ...input,
      studentLimit: 41,
      staffLimit: 3,
      trialDays: 90,
      publicSignup: true,
    }))

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON before RPC execution', async () => {
    const request = new Request('http://localhost/api/admin/institutions/free-pilots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }) as import('next/server').NextRequest

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('provisions a bounded pilot through the caller JWT and writes redundant admin context', async () => {
    const response = await POST(post({ ...input, name: ` ${input.name} ` }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(result)
    expect(mocks.rpc).toHaveBeenCalledWith('provision_free_pilot_institution', {
      p_user_id: ADMIN.id,
      p_name: input.name,
      p_manager_user_id: MANAGER_ID,
      p_approval_ref: input.approvalReference,
      p_student_limit: 30,
      p_staff_limit: 2,
      p_trial_days: 30,
      p_request_id: REQUEST_ID,
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'provision_free_institution_pilot',
      targetId: INSTITUTION_ID,
      details: expect.objectContaining({
        approvalReference: input.approvalReference,
        studentLimit: 30,
        staffLimit: 2,
      }),
    }))
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('fails closed when the distributed limiter backend is unavailable', async () => {
    mocks.limiter.mockResolvedValue({
      success: false,
      reason: 'backend_unavailable',
      retryAfter: 19,
    })

    const response = await POST(post(input))

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('19')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns 429 with retry guidance when the distributed limit is exhausted', async () => {
    mocks.limiter.mockResolvedValue({ success: false, retryAfter: 11 })

    const response = await POST(post(input))

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('11')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('maps the authoritative database gate to a retryable unavailable response', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '55000' } })

    const response = await POST(post(input))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Ücretsiz kurum pilotu oluşturulamadı' })
  })

  it('rejects a malformed successful RPC response', async () => {
    mocks.rpc.mockResolvedValue({ data: { institution: { id: INSTITUTION_ID } }, error: null })

    const response = await POST(post(input))

    expect(response.status).toBe(500)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it('does not report a committed pilot as failed when the secondary admin log fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.logAdminAction.mockResolvedValue({ error: { message: 'admin log unavailable' } })

    const response = await POST(post(input))

    expect(response.status).toBe(201)
    expect(consoleError).toHaveBeenCalledWith(
      '[Institution Free Pilot] ikincil admin günlüğü yazılamadı:',
      'admin log unavailable',
    )
    consoleError.mockRestore()
  })
})
