import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────

const mockGetUser = vi.fn()
const mockChallengeSingle = vi.fn()
const mockUpdateEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn(() => ({
      // SELECT path: .select().eq().eq().eq().single()
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockChallengeSingle,
            })),
          })),
        })),
      })),
      // UPDATE path: .update().eq()
      update: vi.fn(() => ({
        eq: mockUpdateEq,
      })),
    })),
  }),
}))

import { PATCH } from '../route'

// ─── Helpers ────────────────────────────────────────

const CHALLENGE_ID = '20000000-0000-4000-8000-000000000001'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/challenges/${CHALLENGE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const paramsPromise = Promise.resolve({ id: CHALLENGE_ID })

// ─── Tests ──────────────────────────────────────────

describe('PATCH /api/challenges/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateEq.mockResolvedValue({ error: null })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid action', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    const res = await PATCH(makeRequest({ action: 'invalid' }), { params: paramsPromise })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Gecersiz')
  })

  it('returns 404 if challenge not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({ data: null, error: null })

    const res = await PATCH(makeRequest({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(404)
  })

  it('returns 400 if challenge expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({
      data: {
        id: CHALLENGE_ID,
        status: 'pending',
        opponent_id: 'u2',
        expires_at: '2020-01-01T00:00:00Z', // Past date
      },
      error: null,
    })

    const res = await PATCH(makeRequest({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('sure')
  })

  it('accepts challenge successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({
      data: {
        id: CHALLENGE_ID,
        status: 'pending',
        opponent_id: 'u2',
        expires_at: '2099-01-01T00:00:00Z',
      },
      error: null,
    })

    const res = await PATCH(makeRequest({ action: 'accept' }), { params: paramsPromise })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')
  })

  it('declines challenge successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } })
    mockChallengeSingle.mockResolvedValue({
      data: {
        id: CHALLENGE_ID,
        status: 'pending',
        opponent_id: 'u2',
        expires_at: '2099-01-01T00:00:00Z',
      },
      error: null,
    })

    const res = await PATCH(makeRequest({ action: 'decline' }), { params: paramsPromise })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('declined')
  })
})
