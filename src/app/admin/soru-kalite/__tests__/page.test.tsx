import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// #378 admin soru-kalite (drift) sayfasi — fetch + render + filtre + pasiflestir.

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

import AdminQuestionQualityPage from '../page'

const SAMPLE = {
  questions: [
    {
      id: 'q1', game: 'matematik', category: 'cebir', subcategory: null,
      difficulty: 3, is_active: true, question_text: 'Kotu soru bir',
      times_answered: 100, times_correct: 20, success_rate: 20, pending_reports: 2,
    },
    {
      id: 'q2', game: 'turkce', category: 'paragraf', subcategory: 'anlam',
      difficulty: 2, is_active: false, question_text: 'Soru iki',
      times_answered: 50, times_correct: 18, success_rate: 36, pending_reports: 0,
    },
  ],
  minAnswered: 20, maxRate: 50, capped: false,
}

function mockQuality(payload: unknown) {
  fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/admin/question-quality')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
    }
    if (typeof url === 'string' && url.includes('/api/admin/content-quality')) {
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }) // PATCH /api/questions
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockQuality(SAMPLE)
})

describe('AdminQuestionQualityPage', () => {
  it('API dan gelen drift sorularini + basari/rapor degerlerini render eder', async () => {
    render(<AdminQuestionQualityPage />)
    expect(await screen.findByText('Kotu soru bir')).toBeInTheDocument()
    expect(screen.getByText('Soru iki')).toBeInTheDocument()
    expect(screen.getByText('%20')).toBeInTheDocument() // q1 success_rate
    expect(screen.getByText('2 🐛')).toBeInTheDocument() // q1 pending_reports rozeti
  })

  it('capped=true iken aday-havuzu uyarisini gosterir', async () => {
    mockQuality({ ...SAMPLE, capped: true })
    render(<AdminQuestionQualityPage />)
    expect(await screen.findByText(/Aday havuzu 500/)).toBeInTheDocument()
  })

  it('drift soru yoksa bos durum mesaji gosterir', async () => {
    mockQuality({ ...SAMPLE, questions: [] })
    render(<AdminQuestionQualityPage />)
    expect(await screen.findByText(/drift soru yok/)).toBeInTheDocument()
  })

  it('maxRate filtresi degisince yeni esikle yeniden fetch eder', async () => {
    render(<AdminQuestionQualityPage />)
    await screen.findByText('Kotu soru bir')
    fetchMock.mockClear()
    fireEvent.change(screen.getByDisplayValue('%50'), { target: { value: '30' } })
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('maxRate=30'),
      )
      expect(call).toBeTruthy()
    })
  })

  it('soru durumunu PATCH /api/questions ile degistirir (hizli pasiflestir)', async () => {
    render(<AdminQuestionQualityPage />)
    await screen.findByText('Kotu soru bir')
    // q1 aktif → "Aktif" butonu; tikla → is_active:false PATCH
    fireEvent.click(screen.getByRole('button', { name: 'Aktif' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/api/questions')
      expect(call).toBeTruthy()
      expect(JSON.parse((call![1] as { body: string }).body)).toMatchObject({
        questionId: 'q1',
        updates: { is_active: false },
      })
    })
  })

  it('governance açıkken aktif soruyu doğrudan güncellemek yerine karantinaya alır', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/question-quality')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SAMPLE) })
      if (url === '/api/admin/content-quality?limit=50') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [], nextCursor: null }) })
      if (url.includes('/api/admin/content-quality/questions/q1/quarantine')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'quarantined' }) })
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
    })
    render(<AdminQuestionQualityPage />)
    await screen.findByText('Kotu soru bir')
    fireEvent.click(screen.getByRole('button', { name: 'Aktif' }))
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/quarantine'))).toBe(true))
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/questions')).toBe(false)
  })
})
