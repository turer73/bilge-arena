import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  logAdminAction: vi.fn(),
  rpc: vi.fn(),
  limiter: vi.fn(),
  onboardingEnabled: vi.fn(),
}))

vi.mock('@/lib/institution-pilot/server-security', () => ({
  isInstitutionPilotEnabled: () => true,
  isInstitutionOnboardingEnabled: mocks.onboardingEnabled,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ marker: 'cookie', rpc: mocks.rpc })) }))
vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mocks.checkPermission,
  logAdminAction: mocks.logAdminAction,
}))
vi.mock('@/lib/utils/rate-limit', () => ({ createRateLimiter: () => ({ check: mocks.limiter }) }))

import { GET, PATCH, POST } from '../route'

const ADMIN = { id: '11111111-1111-4111-8111-111111111111' }
const MANAGER_ID = '22222222-2222-4222-8222-222222222222'
const INSTITUTION_ID = '33333333-3333-4333-8333-333333333333'
const CREATED_AT = '2026-08-14T10:00:00.000Z'

function post(body: unknown) {
  return new Request('http://localhost/api/admin/institutions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

function patch(body: unknown) {
  return new Request('http://localhost/api/admin/institutions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkPermission.mockResolvedValue(ADMIN)
  mocks.limiter.mockResolvedValue({ success: true })
  mocks.logAdminAction.mockResolvedValue({ error: null })
  mocks.onboardingEnabled.mockReturnValue(true)
})

describe('admin institution routes', () => {
  it('keeps new paid institution onboarding fail-closed without its explicit switch', async () => {
    mocks.onboardingEnabled.mockReturnValue(false)

    const response = await POST(post({ name: 'Bilge Kurs', managerUserId: MANAGER_ID }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Yeni kurum kabulü kapalı' })
    expect(mocks.checkPermission).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('denies callers without the institution management permission', async () => {
    mocks.checkPermission.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
    expect((await POST(post({}))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns the strict platform directory', async () => {
    const payload = { institutions: [{
      id: INSTITUTION_ID, name: 'Bilge Kurs', status: 'pilot', studentLimit: 200,
      staffLimit: 6, staffCount: 1, classroomCount: 0, studentCount: 0,
      manager: { userId: MANAGER_ID, alias: 'Yönetici' },
      supportAccess: { active: false, expiresAt: null, reason: null }, createdAt: CREATED_AT,
    }] }
    mocks.rpc.mockResolvedValue({ data: payload, error: null })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(payload)
    expect(mocks.rpc).toHaveBeenCalledWith('list_pilot_institutions', { p_user_id: ADMIN.id })
  })

  it('provisions a manager-bound institution and writes an audit event', async () => {
    const requestId = '44444444-4444-4444-8444-444444444444'
    const payload = {
      institution: { id: INSTITUTION_ID, name: 'Bilge Kurs', status: 'pilot', studentLimit: 200, staffLimit: 6, createdAt: CREATED_AT },
      membership: { memberRef: 'a'.repeat(32), role: 'manager', joinedAt: CREATED_AT },
      replayed: false,
    }
    mocks.rpc.mockResolvedValue({ data: payload, error: null })
    const response = await POST(post({ name: ' Bilge Kurs ', managerUserId: MANAGER_ID, requestId }))
    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledWith('provision_pilot_institution', {
      p_user_id: ADMIN.id, p_name: 'Bilge Kurs', p_manager_user_id: MANAGER_ID, p_request_id: requestId,
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'provision_institution', targetId: INSTITUTION_ID,
    }))
  })

  it('rejects raw user ids and malformed names before RPC execution', async () => {
    const response = await POST(post({ name: 'x', managerUserId: 'not-a-uuid', requestId: 'bad' }))
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('changes institution status through the caller JWT and audits the reason', async () => {
    const requestId = '55555555-5555-4555-8555-555555555555'
    const payload = {
      institutionId: INSTITUTION_ID,
      previousStatus: 'pilot',
      status: 'suspended',
      changed: true,
      replayed: false,
    }
    mocks.rpc.mockResolvedValue({ data: payload, error: null })
    const response = await PATCH(patch({
      institutionId: INSTITUTION_ID,
      status: 'suspended',
      reason: 'Ödeme ve güvenlik incelemesi tamamlanana kadar.',
      requestId,
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('set_pilot_institution_status', {
      p_user_id: ADMIN.id,
      p_institution_id: INSTITUTION_ID,
      p_status: 'suspended',
      p_reason: 'Ödeme ve güvenlik incelemesi tamamlanana kadar.',
      p_request_id: requestId,
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'set_institution_status', targetId: INSTITUTION_ID,
    }))
  })

  it('does not report a committed status mutation as failed when the secondary log fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.rpc.mockResolvedValue({
      data: {
        institutionId: INSTITUTION_ID,
        previousStatus: 'pilot',
        status: 'suspended',
        changed: true,
        replayed: false,
      },
      error: null,
    })
    mocks.logAdminAction.mockResolvedValue({ error: { message: 'admin log unavailable' } })

    const response = await PATCH(patch({
      institutionId: INSTITUTION_ID,
      status: 'suspended',
      reason: 'İnceleme tamamlanana kadar askıya alındı.',
      requestId: '66666666-6666-4666-8666-666666666666',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'suspended', changed: true })
    expect(consoleError).toHaveBeenCalledWith(
      '[Institution Status] ikincil admin günlüğü yazılamadı:',
      'admin log unavailable',
    )
    consoleError.mockRestore()
  })
})
