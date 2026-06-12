/**
 * Bilge Arena: /api/cron/honeypot-check — sentinel bütünlük cron'u.
 * Auth (CRON_SECRET), sağlıklı yol, drift→Sentry fatal alarm,
 * RPC hatası→Sentry error + 500, boş sonuç→alarm.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// CRON_SECRET modul basinda okundugu icin import'tan once set (repo cron-test paterni)
const { mockRpc, mockCapture, mockFlush } = vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-secret-123'
  return {
    mockRpc: vi.fn(),
    mockCapture: vi.fn(),
    mockFlush: vi.fn(() => Promise.resolve(true)),
  }
})

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mockCapture,
  flush: mockFlush,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mockRpc })),
}))

import { GET } from '../route'

function reqWith(auth?: string) {
  return new Request('http://localhost/api/cron/honeypot-check', {
    headers: auth ? { authorization: auth } : {},
  })
}

const HEALTHY = {
  honeypot_exists: true,
  honeypot_username: '__honeypot_user__',
  honeypot_xp: 0,
  honeypot_last_played_at: null,
  drift_detected: false,
  message: 'OK',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRpc.mockResolvedValue({ data: [HEALTHY], error: null })
})

describe('GET /api/cron/honeypot-check', () => {
  it('CRON_SECRET olmadan/yanlis header ile 401', async () => {
    expect((await GET(reqWith())).status).toBe(401)
    expect((await GET(reqWith('Bearer yanlis'))).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('saglikli: 200 ok, Sentry cagrilmaz', async () => {
    const res = await GET(reqWith('Bearer test-secret-123'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', drift: false })
    expect(mockRpc).toHaveBeenCalledWith('check_honeypot_integrity')
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('drift: Sentry fatal alarm + flush, cron 200 doner', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...HEALTHY, drift_detected: true, message: 'Honeypot SILINMIS — saldiri belirtisi', honeypot_exists: false }],
      error: null,
    })
    const res = await GET(reqWith('Bearer test-secret-123'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'alarm', drift: true })
    expect(mockCapture).toHaveBeenCalledWith(
      expect.stringContaining('[HONEYPOT ALARM]'),
      expect.objectContaining({ level: 'fatal' }),
    )
    expect(mockFlush).toHaveBeenCalled()
  })

  it('alarm extra payload username SIZDIRMAZ', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...HEALTHY, drift_detected: true, message: 'Honeypot DEGISMIS' }],
      error: null,
    })
    await GET(reqWith('Bearer test-secret-123'))
    const extra = mockCapture.mock.calls[0][1].extra
    expect(extra).not.toHaveProperty('honeypot_username')
  })

  it('RPC hatasi: Sentry error + 500 (tripwire kor kalmaz)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42P13', message: 'fn yok' } })
    const res = await GET(reqWith('Bearer test-secret-123'))
    expect(res.status).toBe(500)
    expect(mockCapture).toHaveBeenCalledWith(
      expect.stringContaining('RPC hatasi'),
      expect.objectContaining({ level: 'error' }),
    )
    expect(mockFlush).toHaveBeenCalled()
  })

  it('bos sonuc: alarm (error) + 500', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const res = await GET(reqWith('Bearer test-secret-123'))
    expect(res.status).toBe(500)
    expect(mockCapture).toHaveBeenCalledWith(
      expect.stringContaining('bos sonuc'),
      expect.objectContaining({ level: 'error' }),
    )
  })
})
