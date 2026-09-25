import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationVerdictPanel } from '../validation-verdict-panel'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function item(questionId: string, category: string) {
  return {
    questionId,
    verdict: 'NEEDS_REVIEW',
    game: 'matematik',
    category,
    isActive: true,
    findingCodes: ['AMBIGUOUS_WORDING'],
    findings: [{ code: 'AMBIGUOUS_WORDING', evidence: 'İki okuma var.' }],
    rationale: 'İnsan incelemesi gerekli.',
    blindAgreementRatio: 1,
    decidedAt: '2026-08-22T12:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const offset = Number(url.searchParams.get('offset') ?? 0)
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        total: 75,
        policyVersion: 'question-quality@2',
        items: [offset === 50
          ? item('22222222-2222-4222-8222-222222222222', 'İkinci sayfa')
          : item('11111111-1111-4111-8111-111111111111', 'İlk sayfa')],
      }),
    })
  })
})

describe('ValidationVerdictPanel', () => {
  it('50 kayittan sonraki otomatik karar sayfasina ulasir', async () => {
    render(<ValidationVerdictPanel />)

    expect(await screen.findByText('İlk sayfa')).toBeInTheDocument()
    expect(screen.getByText(/1-1 \/ 75 soru/)).toBeInTheDocument()
    expect(screen.getByText(/Denetim kuralı sürüm 2/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }))

    expect(await screen.findByText('İkinci sayfa')).toBeInTheDocument()
    expect(screen.getByText(/51-51 \/ 75 soru/)).toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('offset=50'))).toBe(true))
  })

  it('bulguyu Türkçe gösterir ve kanıt penceresini Escape ile kapatır', async () => {
    render(<ValidationVerdictPanel />)
    expect(await screen.findByText('İlk sayfa')).toBeInTheDocument()
    expect(screen.getByText('Birden fazla yorumlanabilen ifade')).toBeInTheDocument()

    expect(screen.queryByText('AMBIGUOUS_WORDING')).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Kanıtı göster' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Soru kanıtı' })
    expect(dialog).toHaveTextContent('İki okuma var.')
    expect(document.body.style.overflow).toBe('hidden')
    expect(dialog).toHaveTextContent('AMBIGUOUS_WORDING')
    expect(screen.getByRole('button', { name: 'Kapat' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })
})
