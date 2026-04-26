import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────
// vi.hoisted: vi.mock factory'leri import time'da calisir; bu yuzden mock fn'leri
// hoist edilmis blok icinde tanimlanmali (TDZ ReferenceError onlemek icin).

const {
  mockInsert,
  mockFrom,
  mockRateLimitCheck,
  mockResendSend,
  mockCreateClient,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => {
  const mockInsert = vi.fn()
  const mockFrom = vi.fn(() => ({ insert: mockInsert }))
  const mockRateLimitCheck = vi.fn()
  const mockResendSend = vi.fn()
  // Defense-in-depth: hem anon hem service-role client mock'lansin.
  // Codex P1 fix sonrasi route service-role kullanir (RLS, anon INSERT'i blokluyor).
  // Mevcut testler her iki mock da ayni mockFrom'u dondurdugu icin etkilenmez.
  const mockCreateClient = vi.fn(async () => ({ from: mockFrom }))
  const mockCreateServiceRoleClient = vi.fn(() => ({ from: mockFrom }))
  return {
    mockInsert,
    mockFrom,
    mockRateLimitCheck,
    mockResendSend,
    mockCreateClient,
    mockCreateServiceRoleClient,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
}))

// class form: vi.fn().mockImplementation(arrow) constructor degil --
// "new Resend()" throw eder. Class instance bekliyoruz.
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockResendSend }
  },
}))

// ─── Import after mocks ──────────────────────────────

import { POST } from '../route'

// ─── Helper ──────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/premium/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

// ─── Tests ───────────────────────────────────────────

describe('POST /api/premium/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // default: rate-limit OK, insert OK, resend OK
    mockRateLimitCheck.mockResolvedValue({ success: true })
    mockInsert.mockResolvedValue({ error: null })
    mockResendSend.mockResolvedValue({ data: { id: 'test' }, error: null })
    // Resend env so route doesn't early-skip
    process.env.RESEND_API_KEY = 'test_key'
  })

  it('returns 400 for invalid email', async () => {
    const req = makeRequest({
      email: 'not-an-email',
      plan: 'monthly',
      kvkkConsent: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 400 when kvkkConsent is false', async () => {
    const req = makeRequest({
      email: 'user@example.com',
      plan: 'monthly',
      kvkkConsent: false,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid plan', async () => {
    const req = makeRequest({
      email: 'user@example.com',
      plan: 'lifetime', // not allowed
      kvkkConsent: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 on valid submit and inserts row', async () => {
    const req = makeRequest({
      email: 'newuser@example.com',
      plan: 'yearly',
      kvkkConsent: true,
      source: '/arena/premium',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const insertedRow = mockInsert.mock.calls[0][0]
    expect(insertedRow.email).toBe('newuser@example.com')
    expect(insertedRow.plan).toBe('yearly')
    expect(insertedRow.kvkk_consent_at).toBeTruthy()
    // Best-effort email: actually fired (mock'un dogru kuruldugunun kaniti)
    expect(mockResendSend).toHaveBeenCalledTimes(1)
    const emailArg = mockResendSend.mock.calls[0][0]
    expect(emailArg.to).toBe('newuser@example.com')
    expect(emailArg.subject).toMatch(/lansman|premium/i)
  })

  it('returns 429 when rate-limited', async () => {
    mockRateLimitCheck.mockResolvedValue({ success: false, retryAfter: 30 })
    const req = makeRequest({
      email: 'user@example.com',
      plan: 'monthly',
      kvkkConsent: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 200 even when Resend fails (best effort email)', async () => {
    mockResendSend.mockRejectedValue(new Error('SMTP down'))
    const req = makeRequest({
      email: 'user@example.com',
      plan: 'monthly',
      kvkkConsent: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalled()
  })

  it('treats duplicate (unique violation) as idempotent success', async () => {
    // Postgres unique violation code 23505
    mockInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key' },
    })
    const req = makeRequest({
      email: 'duplicate@example.com',
      plan: 'monthly',
      kvkkConsent: true,
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it('lowercases and trims email before insert', async () => {
    const req = makeRequest({
      email: '  USER@Example.COM  ',
      plan: 'monthly',
      kvkkConsent: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const insertedRow = mockInsert.mock.calls[0][0]
    expect(insertedRow.email).toBe('user@example.com')
  })

  // 2026-04-26 (Codex P1 fix): waitlist route, anon client yerine service-role client kullanmali.
  // Migration 039 sonrasi RLS policy 'TO service_role' ile kilitlenir; anon client INSERT yapamaz.
  // Route service-role'u kullanmazsa production'da 401/403 doner. Bu test, refactor'un bozulmamasini garantiler.
  it('uses service-role client (not anon) so RLS lock to service_role works', async () => {
    const req = makeRequest({
      email: 'security-check@example.com',
      plan: 'monthly',
      kvkkConsent: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    // Defense-in-depth: anon createClient hic cagrilmamali, service-role'a gecilmis olmali
    expect(mockCreateServiceRoleClient).toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})
