import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentGovernancePanel } from '../content-governance-panel'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch
const OLD = '11111111-1111-4111-8111-111111111111'
const CURRENT = '22222222-2222-4222-8222-222222222222'
const QUESTION = '33333333-3333-4333-8333-333333333333'
const INCIDENT = '44444444-4444-4444-8444-444444444444'
let incidentCreated = false

const detail = () => ({ revision: {
  revisionId: OLD, questionId: QUESTION, revisionNo: 1, status: 'superseded', summary: 'Hatalı anahtar',
  content: { question: 'Eski soru', options: ['A', 'B'], answer: 1 }, metadata: { game: 'matematik', category: 'Temel', difficulty: 2 },
  source: { title: 'İç kaynak', licenseCode: 'INTERNAL' }, outcomes: [], approvals: [], psychometrics: [],
  validation: {
    policyVersion: 'question-quality@1', verdict: 'NEEDS_REVIEW',
    findings: [{ code: 'AMBIGUOUS_WORDING', evidence: 'İki farklı okuma farklı seçeneklere götürüyor.' }],
    rationale: 'İnsan incelemesi gerekli', blindConsensusIndex: 1, blindAgreementRatio: 1,
    decidedAt: '2026-08-09T09:00:00.000Z',
  },
  incidents: incidentCreated ? [{ incidentId: INCIDENT, erroneousRevisionId: OLD, correctedRevisionId: CURRENT, errorType: 'wrong_key', status: 'open', eligibleCount: 4, changedCount: 0, manualRequiredCount: 1, createdAt: '2026-08-09T10:00:00.000Z', closedAt: null }] : [],
} })

beforeEach(() => {
  vi.clearAllMocks(); incidentCreated = false
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/admin/content-quality?limit=50') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [{ revisionId: OLD, questionId: QUESTION, status: 'superseded', createdAt: '2026-08-09T10:00:00.000Z' }], nextCursor: null }) })
    if (url.includes(`revisionId=${OLD}`)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail()) })
    if (url.includes(`questionId=${QUESTION}`)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ revision: { revisionId: CURRENT } }) })
    if (url === '/api/admin/content-quality/incidents' && init?.method === 'POST') { incidentCreated = true; return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ incidentId: INCIDENT, eligibleCount: 4, manualRequiredCount: 1, replayed: false }) }) }
    if (url.includes(`/incidents/${INCIDENT}/apply`) && init?.method === 'POST') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ incidentId: INCIDENT, eligibleCount: 4, changedCount: 4, manualRequiredCount: 1, replayed: false }) })
    if (url.includes('/psychometrics') && init?.method === 'POST') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ revisionId: OLD, sampleN: 30, correctN: 18, pCorrect: 0.6, wilsonLow: 0.43, wilsonHigh: 0.77, discrimination: 0.4, replayed: false }) })
    return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'unexpected' }) })
  })
})

describe('ContentGovernancePanel', () => {
  it('otomatik karar ve kaniti revizyon detayinda gosterir', async () => {
    render(<ContentGovernancePanel />)
    fireEvent.click(await screen.findByText('Eski revizyon'))
    expect(await screen.findByText(/İnsan incelemesi gerekli · question-quality@1/)).toBeInTheDocument()
    expect(screen.getByText('AMBIGUOUS_WORDING')).toBeInTheDocument()
    expect(screen.getByText(/İki farklı okuma/)).toBeInTheDocument()
  })

  it('creates a correction preview against the current published revision and can apply it', async () => {
    render(<ContentGovernancePanel />)
    fireEvent.click(await screen.findByText('Eski revizyon'))
    fireEvent.click(await screen.findByText('Etki önizlemesi oluştur'))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/admin/content-quality/incidents' && init?.method === 'POST')
      expect(JSON.parse((call?.[1] as RequestInit).body as string)).toMatchObject({ questionId: QUESTION, revisionId: OLD, correctedRevisionId: CURRENT, errorType: 'wrong_key' })
      expect((call?.[1] as RequestInit).body).not.toMatch(/userId|actorId/)
    })
    fireEvent.click(await screen.findByText('Append-only düzeltmeleri uygula'))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes(`/incidents/${INCIDENT}/apply`) && init?.method === 'POST')).toBe(true))
  })

  it('requests a canonical 30-day psychometric window', async () => {
    render(<ContentGovernancePanel />)
    fireEvent.click(await screen.findByText('Eski revizyon'))
    fireEvent.click(await screen.findByText('Psikometriyi yenile'))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/psychometrics') && init?.method === 'POST')
      const body = JSON.parse((call?.[1] as RequestInit).body as string)
      expect(new Date(body.windowEnd).getTime() - new Date(body.windowStart).getTime()).toBe(30 * 24 * 60 * 60 * 1000)
      expect(body).not.toHaveProperty('userId')
    })
  })
})
