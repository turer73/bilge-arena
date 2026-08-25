/**
 * Bilge Arena: checkAdminMutationRl — admin mutasyon RL helper'ı.
 * Limit içinde null, aşımda 429 + Retry-After; upload ayrı dar kova.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

// vi.mock hoist edilir — factory'nin gordugu state vi.hoisted ile tanimlanmali
// (duz const TDZ'de kalir: standalone gecip full-suite'te import-sirasina gore patlar)
const checks = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>)
vi.mock('../rate-limit', () => ({
  createRateLimiter: (name: string) => {
    checks[name] = vi.fn().mockResolvedValue({ success: true })
    return { check: checks[name] }
  },
}))

import { checkAdminMutationRl } from '../admin-rate-limit'

beforeEach(() => {
  Object.values(checks).forEach((c) => c.mockClear().mockResolvedValue({ success: true }))
})

describe('checkAdminMutationRl', () => {
  test('limit içinde: null döner, mutation kovasını kullanır', async () => {
    const res = await checkAdminMutationRl('admin-1')
    expect(res).toBeNull()
    expect(checks['admin-mutation']).toHaveBeenCalledWith('admin-1')
    expect(checks['admin-upload']).not.toHaveBeenCalled()
  })

  test('aşımda: 429 + Retry-After header', async () => {
    checks['admin-mutation'].mockResolvedValue({ success: false, retryAfter: 42 })
    const res = await checkAdminMutationRl('admin-1')
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get('Retry-After')).toBe('42')
  })

  test("upload kind'ı ayrı kovayı kullanır", async () => {
    await checkAdminMutationRl('admin-1', 'upload')
    expect(checks['admin-upload']).toHaveBeenCalledWith('admin-1')
    expect(checks['admin-mutation']).not.toHaveBeenCalled()
  })

  test('retryAfter yoksa 60 fallback', async () => {
    checks['admin-mutation'].mockResolvedValue({ success: false })
    const res = await checkAdminMutationRl('admin-1')
    expect(res!.headers.get('Retry-After')).toBe('60')
  })

  test('Redis kullanilamiyorsa 503 ile fail-closed doner', async () => {
    checks['admin-mutation'].mockResolvedValue({
      success: false,
      retryAfter: 60,
      reason: 'backend_unavailable',
    })
    const res = await checkAdminMutationRl('admin-1')

    expect(res!.status).toBe(503)
    await expect(res!.json()).resolves.toEqual({
      error: 'Güvenlik servisi geçici olarak kullanılamıyor',
    })
  })
})
