/**
 * Bilge Arena: createNotification — service-role bildirim ekleme yardımcısı.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createNotification } from '../create'

const insert = vi.fn()
const svc = { from: vi.fn(() => ({ insert })) } as never

beforeEach(() => {
  vi.clearAllMocks()
  insert.mockResolvedValue({ error: null })
})

describe('createNotification', () => {
  test('notifications tablosuna alanları map\'leyerek insert eder', async () => {
    await createNotification(svc, {
      userId: 'u1',
      type: 'submission_approved',
      title: 'Onaylandı',
      body: '+50',
      link: '/arena/soru-gonder',
    })
    expect(insert).toHaveBeenCalledWith({
      user_id: 'u1',
      type: 'submission_approved',
      title: 'Onaylandı',
      body: '+50',
      link: '/arena/soru-gonder',
    })
  })

  test('opsiyonel body/link yoksa null yazar', async () => {
    await createNotification(svc, { userId: 'u1', type: 'submission_rejected', title: 'X' })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ body: null, link: null }),
    )
  })

  test('insert hatası fırlatmaz (yan etki — ana akışı bozmaz)', async () => {
    insert.mockResolvedValue({ error: { code: '500' } })
    await expect(
      createNotification(svc, { userId: 'u1', type: 'submission_approved', title: 'X' }),
    ).resolves.toBeUndefined()
  })
})
