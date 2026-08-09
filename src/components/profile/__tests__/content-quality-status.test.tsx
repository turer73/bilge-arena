import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentQualityStatus } from '../content-quality-status'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CONTENT_APPEALS_ENABLED', 'true')
  fetchMock.mockImplementation((input: RequestInfo | URL) => String(input).endsWith('/appeals')
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ appeals: [{ status: 'investigating', submittedAt: '2026-08-01T10:00:00.000Z', acknowledgmentDueAt: '2026-08-03T10:00:00.000Z', resolutionDueAt: '2026-08-15T10:00:00.000Z', publicMessage: 'İnceleme sürüyor.' }] }) })
    : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ corrections: [{ sessionDate: '2026-08-01', reason: 'verified_question_error', scoreDelta: 1, correctedAt: '2026-08-09T10:00:00.000Z' }] }) }))
})
afterEach(() => vi.unstubAllEnvs())

describe('ContentQualityStatus', () => {
  it('shows only generic owner appeal and correction information', async () => {
    render(<ContentQualityStatus />)
    expect(await screen.findByText('İnceleme sürüyor.')).toBeInTheDocument()
    expect(screen.getByText(/skor etkisi \+1/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/correctOption|answer key|reviewer|userId|sessionAnswerId/i)
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/appeals', expect.objectContaining({ cache: 'no-store' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/corrections', expect.objectContaining({ cache: 'no-store' }))
  })
})
