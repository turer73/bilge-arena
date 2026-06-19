import { describe, it, expect, vi, beforeEach } from 'vitest'

import { submitQuestionReport } from '../submit-report'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const DATA = { type: 'wrong_answer', description: 'yanlis' }

describe('submitQuestionReport (Codex PR#242 P1: res.ok bazlı sonuç)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('200 → { ok: true }', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 })
    expect(await submitQuestionReport('q1', DATA)).toEqual({ ok: true })
  })

  it('401 (guest) → { ok:false, giriş mesajı } — sahte başarı YOK', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    const r = await submitQuestionReport('q1', DATA)
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('giriş')
  })

  it('429 → { ok:false, çok hızlı mesajı }', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 })
    const r = await submitQuestionReport('q1', DATA)
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('Çok fazla')
  })

  it('diğer hata (500) → { ok:false, generic }', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    expect((await submitQuestionReport('q1', DATA)).ok).toBe(false)
  })

  it('network throw → { ok:false, bağlantı mesajı }', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    const r = await submitQuestionReport('q1', DATA)
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('Bağlantı')
  })

  it('doğru endpoint + body gönderir', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201 })
    await submitQuestionReport('q-42', DATA)
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/report', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ questionId: 'q-42', report_type: 'wrong_answer', description: 'yanlis' })
  })
})
