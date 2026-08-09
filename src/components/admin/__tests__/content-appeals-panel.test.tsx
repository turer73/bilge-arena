import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentAppealsPanel } from '../content-appeals-panel'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const item = {
  appealId: '11111111-1111-4111-8111-111111111111', questionId: '22222222-2222-4222-8222-222222222222', revisionId: null,
  reasonCode: 'ambiguous', description: 'İki seçenek de doğru görünüyor.', status: 'submitted',
  submittedAt: '2026-08-09T10:00:00.000Z', ackDueAt: '2026-08-11T10:00:00.000Z', resolveDueAt: '2026-08-23T10:00:00.000Z',
  slaBreachedAt: null, hasSessionEvidence: true, latestPublicMessage: null, latestInternalNote: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(init?.method === 'POST'
    ? { ok: true, status: 200, json: () => Promise.resolve({ status: 'investigating', replayed: false }) }
    : { ok: true, status: 200, json: () => Promise.resolve({ items: [item], nextCursor: null }) }))
})

describe('ContentAppealsPanel', () => {
  it('shows privacy-scoped evidence and sends a server-actor resolution payload', async () => {
    render(<ContentAppealsPanel />)
    fireEvent.click(await screen.findByText('İki seçenek de doğru görünüyor.'))
    fireEvent.change(screen.getByLabelText('Yeni durum'), { target: { value: 'investigating' } })
    fireEvent.change(screen.getByLabelText('Öğrenciye mesaj'), { target: { value: 'Kanıtlar inceleniyor.' } })
    fireEvent.change(screen.getByLabelText(/İç not/), { target: { value: 'İkinci göz gerekli.' } })
    fireEvent.click(screen.getByText('Kararı kaydet'))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(String(call?.[0])).toContain(`/appeals/${item.appealId}/resolve`)
      expect(JSON.parse((call?.[1] as RequestInit).body as string)).toMatchObject({ status: 'investigating', publicMessage: 'Kanıtlar inceleniyor.', internalNote: 'İkinci göz gerekli.' })
      expect((call?.[1] as RequestInit).body).not.toMatch(/userId|actorId|sessionAnswerId/)
    })
  })
})
