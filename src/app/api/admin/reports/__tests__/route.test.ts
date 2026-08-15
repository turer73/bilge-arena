import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mock setup ──────────────────────────────────

const {
  mockCheckPermission,
  mockEq,
  mockRange,
  mockRangeResult,
  mockUpdate,
  mockUpdateEq,
  mockUpdateResult,
  mockInsert,
  mockRpc,
  mockReportRow,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockEq: vi.fn(),
  mockRange: vi.fn(),
  mockRangeResult: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateEq: vi.fn(),
  mockUpdateResult: vi.fn(),
  mockInsert: vi.fn(),
  mockRpc: vi.fn(),
  mockReportRow: vi.fn(),
  mockCreateNotification: vi.fn(),
}))

// User-scoped client — permission check + GET listing query.
// Chain: from('error_reports').select().order().eq?().range()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.order = vi.fn(() => chain)
      chain.eq = vi.fn((col: string, val: unknown) => {
        mockEq(col, val)
        return chain
      })
      chain.range = vi.fn(async (offset: number, end: number) => {
        mockRange(offset, end)
        return mockRangeResult()
      })
      return chain
    }),
  })),
}))

// Service-role client — PATCH update + admin_logs insert.
// Branches on table name because the route hits two tables on one client.
vi.mock('@/lib/notifications/create', () => ({
  createNotification: mockCreateNotification,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'admin_logs') {
        return {
          insert: vi.fn(async (row: unknown) => {
            mockInsert(row)
            return { error: null }
          }),
        }
      }
      return {
        update: vi.fn((payload: unknown) => {
          mockUpdate(payload)
          return {
            eq: vi.fn(async (col: string, val: unknown) => {
              mockUpdateEq(col, val)
              return mockUpdateResult()
            }),
          }
        }),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => mockReportRow()),
          })),
        })),
      }
    }),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { GET, PATCH } from '../route'

// ─── Helpers ─────────────────────────────────────

function makeGetRequest(query = '') {
  return new Request(`http://localhost/api/admin/reports${query}`) as unknown as NextRequest
}

function makePatchRequest(body: unknown) {
  return new Request('http://localhost/api/admin/reports', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

const ADMIN = { id: 'admin-42' }
const REPORT_ID = '11111111-1111-4111-8111-111111111111'

// ─── GET ─────────────────────────────────────────

describe('GET /api/admin/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRangeResult.mockReturnValue({ data: [], count: 0, error: null })
  })

  it('returns 403 without admin.reports.view permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.anything(),
      'admin.reports.view',
    )
  })

  it('returns 200 with { reports, total, page, limit } when authorized', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    mockRangeResult.mockReturnValue({
      data: [{ id: REPORT_ID, status: 'pending' }],
      count: 1,
      error: null,
    })

    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      reports: [{ id: REPORT_ID, status: 'pending' }],
      total: 1,
      page: 1,
      limit: 20,
    })
  })

  it('applies .eq("status", "pending") when ?status=pending', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    await GET(makeGetRequest('?status=pending'))
    expect(mockEq).toHaveBeenCalledWith('status', 'pending')
  })

  it('does NOT filter when ?status=all', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    await GET(makeGetRequest('?status=all'))
    expect(mockEq).not.toHaveBeenCalled()
  })

  it('does NOT filter when status param missing', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    await GET(makeGetRequest())
    expect(mockEq).not.toHaveBeenCalled()
  })

  it('?page=2 offsets by 20 (limit=20)', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    await GET(makeGetRequest('?page=2'))
    expect(mockRange).toHaveBeenCalledWith(20, 39)
  })

  it.each([
    ['?page=0'],
    ['?page=-1'],
    ['?page=abc'],
  ])('falls back to page 1 for %s', async (query) => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    const res = await GET(makeGetRequest(query))
    const json = await res.json()
    expect(json.page).toBe(1)
    expect(mockRange).toHaveBeenCalledWith(0, 19)
  })

  it('clamps ?page=9999 to 1000', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    const res = await GET(makeGetRequest('?page=9999'))
    const json = await res.json()
    expect(json.page).toBe(1000)
    expect(mockRange).toHaveBeenCalledWith(999 * 20, 1000 * 20 - 1)
  })

  it('returns 500 with GENERIC error (no PG message leak) when supabase returns error', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    mockRangeResult.mockReturnValue({
      data: null,
      count: null,
      error: { message: 'db gitti' },
    })
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Bir hata oluştu.')
  })
})

// ─── PATCH ───────────────────────────────────────

describe('PATCH /api/admin/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateResult.mockReturnValue({ error: null })
    // Varsayilan: odul verildi, raporlayan belli.
    mockRpc.mockResolvedValue({
      data: { reportId: REPORT_ID, awarded: true, replayed: false, coins: 250 },
      error: null,
    })
    mockReportRow.mockResolvedValue({ data: { user_id: 'student-1' } })
  })

  it('returns 403 without admin.reports.manage permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await PATCH(
      makePatchRequest({ reportId: REPORT_ID, status: 'reviewed' }),
    )
    expect(res.status).toBe(403)
    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.anything(),
      'admin.reports.manage',
    )
  })

  it("returns 400 'Gecersiz istek' when reportId is missing", async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    const res = await PATCH(makePatchRequest({ status: 'reviewed' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Gecersiz istek')
  })

  it('returns 400 when status is outside the allowed enum', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    const res = await PATCH(
      makePatchRequest({ reportId: REPORT_ID, status: 'wat' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 200 { success: true } on a valid update', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    const res = await PATCH(
      makePatchRequest({ reportId: REPORT_ID, status: 'reviewed' }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', REPORT_ID)
  })

  it('adds resolved_by = admin.id when status === "resolved"', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    await PATCH(makePatchRequest({ reportId: REPORT_ID, status: 'resolved' }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved', resolved_by: ADMIN.id }),
    )
  })

  it('clears resolved_by (null) for non-resolved statuses (P2e)', async () => {
    // P2e fix (Codex PR#242): resolved'DAN çıkışta (reviewed/rejected/pending) eski
    // resolver TEMİZLENMELİ — yoksa status≠resolved iken çelişkili resolved_by kalır.
    mockCheckPermission.mockResolvedValue(ADMIN)
    await PATCH(makePatchRequest({ reportId: REPORT_ID, status: 'rejected' }))
    const payload = mockUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(payload.resolved_by).toBeNull()
  })

  it('passes adminNote through to admin_note column', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    await PATCH(
      makePatchRequest({
        reportId: REPORT_ID,
        status: 'resolved',
        adminNote: 'Düzeltildi',
      }),
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ admin_note: 'Düzeltildi' }),
    )
  })

  it('inserts admin_logs row with action, target_type, target_id, details', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    await PATCH(
      makePatchRequest({
        reportId: REPORT_ID,
        status: 'resolved',
        adminNote: 'ok',
      }),
    )
    expect(mockInsert).toHaveBeenCalledWith({
      admin_id: ADMIN.id,
      action: 'report_resolved',
      target_type: 'report',
      target_id: REPORT_ID,
      details: { status: 'resolved', adminNote: 'ok', rewardedCoins: 250 },
    })
  })

  it('returns 500 with GENERIC error (no PG message leak) when update fails', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN)
    mockUpdateResult.mockReturnValue({ error: { message: 'update failed' } })
    const res = await PATCH(
      makePatchRequest({ reportId: REPORT_ID, status: 'reviewed' }),
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Bir hata oluştu.')
  })
})

// ─── Hata raporu odulu ───────────────────────────

describe('PATCH /api/admin/reports — kabul edilen rapor ödülü', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockUpdateResult.mockReturnValue({ error: null })
    mockRpc.mockResolvedValue({
      data: { reportId: REPORT_ID, awarded: true, replayed: false, coins: 250 },
      error: null,
    })
    mockReportRow.mockResolvedValue({ data: { user_id: 'student-1' } })
  })

  it('resolved yapılınca ödül RPC çağrılır ve bildirim gider', async () => {
    const res = await PATCH(makePatchRequest({ reportId: REPORT_ID, status: 'resolved' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, rewardedCoins: 250 })
    expect(mockRpc).toHaveBeenCalledWith('award_error_report_reward', expect.objectContaining({
      p_admin_id: 'admin-1',
      p_report_id: REPORT_ID,
    }))
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'student-1', type: 'error_report_rewarded' }),
    )
  })

  it('reddedilen raporda ödül verilmez ve bildirim gitmez', async () => {
    await PATCH(makePatchRequest({ reportId: REPORT_ID, status: 'rejected' }))
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('aynı rapor ikinci kez ödüllendirilmez (replayed) — bildirim de gitmez', async () => {
    mockRpc.mockResolvedValue({
      data: { reportId: REPORT_ID, awarded: false, replayed: true, coins: 250 },
      error: null,
    })
    const res = await PATCH(makePatchRequest({ reportId: REPORT_ID, status: 'resolved' }))
    expect(await res.json()).toMatchObject({ rewardedCoins: 0 })
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('ödül RPC hata verirse rapor yine çözülmüş sayılır, bildirim gitmez', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    const res = await PATCH(makePatchRequest({ reportId: REPORT_ID, status: 'resolved' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, rewardedCoins: 0 })
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('anonim raporda (user_id yok) bildirim gitmez', async () => {
    mockRpc.mockResolvedValue({
      data: { reportId: REPORT_ID, awarded: false, replayed: false, coins: 0 },
      error: null,
    })
    await PATCH(makePatchRequest({ reportId: REPORT_ID, status: 'resolved' }))
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })
})
