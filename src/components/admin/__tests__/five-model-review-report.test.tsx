import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FiveModelReviewReport } from '../five-model-review-report'
import type { FiveModelReport } from '@/lib/question-audit/five-model-report'

const questionId = '11111111-1111-4111-8111-111111111111'
const revisionId = '22222222-2222-4222-8222-222222222222'
const nextRevisionId = '33333333-3333-4333-8333-333333333333'
const report: FiveModelReport = {
  questionId, revisionId, contentSha256: 'a'.repeat(64), policyVersion: 'question-quality@2',
  revisionStatus: 'published', questionText: 'Soru', options: ['A', 'B'], markedAnswerIndex: 0,
  completedModels: 1, requiredModels: 5, agreement: 'incomplete', matchesKey: null, capped: false,
  models: [
    { slot: 'deepseek', label: 'DeepSeek', status: 'complete', providerId: 'x', modelId: 'm-1', executedAt: '2026-09-06T10:00:00Z', answerIndex: 0, computedValue: null, summary: 'Kısa kontrol', sampleCount: 1 },
    { slot: 'gemini', label: 'Gemini', status: 'missing', providerId: null, modelId: null, executedAt: null, answerIndex: null, computedValue: null, summary: null, sampleCount: 0 },
    { slot: 'terra', label: 'Terra', status: 'missing', providerId: null, modelId: null, executedAt: null, answerIndex: null, computedValue: null, summary: null, sampleCount: 0 },
    { slot: 'luna', label: 'Luna', status: 'missing', providerId: null, modelId: null, executedAt: null, answerIndex: null, computedValue: null, summary: null, sampleCount: 0 },
    { slot: 'sol', label: 'Sol', status: 'missing', providerId: null, modelId: null, executedAt: null, answerIndex: null, computedValue: null, summary: null, sampleCount: 0 },
  ],
  warnings: ['Eksik model kayıtları'],
}

describe('FiveModelReviewReport', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('fetches lazily for the selected question and renders missing models explicitly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ report }), { status: 200 }))
    render(<FiveModelReviewReport questionId={questionId} />)
    expect(screen.getByText('Rapor yükleniyor…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('DeepSeek')).toBeInTheDocument())
    expect(screen.getByText('1/5')).toBeInTheDocument()
    expect(screen.getByText('Eksik model kayıtları')).toBeInTheDocument()
    expect(screen.getAllByText(/A\) A/).length).toBeGreaterThanOrEqual(2)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`questionId=${questionId}`), expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }))
  })

  it('does not treat a failed request as zero completed models', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
    render(<FiveModelReviewReport revisionId={revisionId} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network'))
    expect(screen.queryByText('0/5')).not.toBeInTheDocument()
  })

  it('ignores a stale response after the selected revision changes', async () => {
    let resolveFirst!: (value: Response) => void
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve })
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: { ...report, revisionId: nextRevisionId, questionText: 'Güncel soru' } }), { status: 200 }))
    const { rerender } = render(<FiveModelReviewReport revisionId={revisionId} />)
    rerender(<FiveModelReviewReport revisionId={nextRevisionId} />)
    await waitFor(() => expect(screen.getByText('Luna')).toBeInTheDocument())
    await act(async () => { resolveFirst(new Response(JSON.stringify({ report: { ...report, questionText: 'Eski soru' } }), { status: 200 })); await first })
    expect(screen.getByText('Güncel soru')).toBeInTheDocument()
    expect(screen.queryByText('Eski soru')).not.toBeInTheDocument()
  })

  it('rejects a 200 response with a mismatched selected id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ report: { ...report, questionId: 'other' } }), { status: 200 }))
    render(<FiveModelReviewReport questionId={questionId} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('geçersiz'))
  })

  it('does not fetch before a question or revision is selected', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    render(<FiveModelReviewReport />)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { ...report, models: [report.models[0], report.models[0], ...report.models.slice(2)] },
    { ...report, warnings: [{ secret: 'not displayable' }] },
    { ...report, options: [{ bad: true }, 'B'] },
    { ...report, agreement: 'unanimous', matchesKey: true },
    { ...report, completedModels: 5 },
    { ...report, models: [null, ...report.models.slice(1)] },
    { ...report, models: [{ ...report.models[0], answerIndex: 8 }, ...report.models.slice(1)] },
  ])('fails closed on malformed or inconsistent report %#', async (invalid) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ report: invalid }))
    render(<FiveModelReviewReport questionId={questionId} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('geçersiz'))
    expect(screen.queryByText('1/5')).not.toBeInTheDocument()
  })

  it('shows disagreement and each canonical answer without approval controls', async () => {
    const completeModels = report.models.map((model, index) => ({ ...model, status: 'complete',
      providerId: `test:${model.slot}`, modelId: `model-${model.slot}`, executedAt: '2026-09-06T10:00:00Z',
      answerIndex: index === 4 ? 1 : 0, computedValue: null, sampleCount: 1,
    }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ report: { ...report, models: completeModels, completedModels: 5, agreement: 'disagreement', matchesKey: false } }))
    render(<FiveModelReviewReport revisionId={revisionId} />)
    await waitFor(() => expect(screen.getByText('Görüş ayrılığı')).toBeInTheDocument())
    expect(screen.getByText('B) B')).toBeInTheDocument()
    expect(screen.getByText('Eşleşmiyor')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /onayla|yayınla/i })).not.toBeInTheDocument()
  })

  it('keeps a no-correct-option solution visible as diagnostic evidence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ report: { ...report,
      models: [{ ...report.models[0], answerIndex: null, computedValue: '-1' }, ...report.models.slice(1)],
    } }))
    render(<FiveModelReviewReport revisionId={revisionId} />)
    await waitFor(() => expect(screen.getByText('-1')).toBeInTheDocument())
    expect(screen.getByText('1/5')).toBeInTheDocument()
    expect(screen.getByText(/Şıklarda karşılık yok/)).toBeInTheDocument()
  })
})
