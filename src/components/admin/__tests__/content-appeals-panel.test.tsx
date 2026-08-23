import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentAppealsPanel } from '../content-appeals-panel'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const item = {
  appealId: '11111111-1111-4111-8111-111111111111', questionId: '22222222-2222-4222-8222-222222222222', revisionId: '33333333-3333-4333-8333-333333333333',
  reasonCode: 'ambiguous', description: 'İki seçenek de doğru görünüyor.', status: 'submitted',
  submittedAt: '2026-08-09T10:00:00.000Z', ackDueAt: '2026-08-11T10:00:00.000Z', resolveDueAt: '2026-08-23T10:00:00.000Z',
  slaBreachedAt: null, hasSessionEvidence: false, evidenceKind: 'issued_attempt', hasVerifiedEvidence: true, selectedOption: 0,
  latestPublicMessage: null, latestInternalNote: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'investigating', replayed: false }) })
    if (url.includes('revisionId=')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ revision: {
      revisionId: item.revisionId,
      content: { question: '2 + 2 kaçtır?', options: ['3', '4'], answer: 1 },
      validation: { verdict: 'APPROVED' },
      psychometrics: [{ sampleN: 30, pCorrect: 0.6, wilsonLow: 0.42, wilsonHigh: 0.75, eligibilityPolicy: 'v3' }],
      appealSignals: { openCount: 2, verifiedOpenCount: 1 },
    } }) })
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [item], nextCursor: null }) })
  })
})

describe('ContentAppealsPanel', () => {
  it('shows privacy-scoped evidence and sends a server-actor resolution payload', async () => {
    render(<ContentAppealsPanel />)
    expect(await screen.findByText(/Doğrulanmış soru sunumu kanıtı/)).toBeInTheDocument()
    fireEvent.click(await screen.findByText('İki seçenek de doğru görünüyor.'))
    expect(await screen.findByText('2 + 2 kaçtır?')).toBeInTheDocument()
    expect(screen.getByText(/Öğrencinin seçimi: 1\. seçenek/)).toBeInTheDocument()
    expect(screen.getByText(/LLM doğrulaması: APPROVED/)).toBeInTheDocument()
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
