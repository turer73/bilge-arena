import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/admin/ai-question-generator', () => ({ AIQuestionGenerator: () => null }))

import AdminQuestionsPage from '../page'

const QUESTION_ID = '11111111-1111-4111-8111-111111111111'
const REVISION_ID = '22222222-2222-4222-8222-222222222222'
const OUTCOME_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'
const SECOND_OUTCOME_ID = '55555555-5555-4555-8555-555555555555'
const NEW_OUTCOME_ID = '66666666-6666-4666-8666-666666666666'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function multiOutcomeFetch(posted: Array<Record<string, unknown>>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/questions?')) return json({ questions: [{
      id: QUESTION_ID, game: 'fen', category: 'fizik', subcategory: null, topic: null,
      difficulty: 2, level_tag: null, is_active: true, is_boss: false, source: 'governed',
      exam_ref: 'TYT', times_answered: 5, times_correct: 3, base_points: 20,
      content: { question: 'Kuvvet?', options: ['A', 'B'], answer: 0 },
    }], total: 1 })
    if (url.startsWith(`/api/admin/content-quality?questionId=${QUESTION_ID}`)) return json({ revision: {
      revisionId: REVISION_ID,
      metadata: { game: 'fen', category: 'fizik', difficulty: 2, examRef: 'TYT', isBoss: false },
      content: { question: 'Kuvvet?', options: ['A', 'B'], answer: 0 },
      source: { kind: 'original', title: 'İç kaynak', licenseCode: 'INTERNAL' },
      outcomes: [
        { outcomeId: OUTCOME_ID, weight: 0.7, primary: true, code: 'FEN-1', title: 'Kuvvet', examRef: 'TYT', taxonomyVersion: 'v1', scopeValid: true, path: [{ code: 'FEN', title: 'Fen', nodeType: 'course' }] },
        { outcomeId: SECOND_OUTCOME_ID, weight: 0.3, primary: false, code: 'FEN-2', title: 'Hareket', examRef: 'TYT', taxonomyVersion: 'v1', scopeValid: true, path: [{ code: 'FEN', title: 'Fen', nodeType: 'course' }] },
      ],
    } })
    if (url.startsWith('/api/admin/content-quality/outcomes?')) return json({ outcomes: [
      { id: OUTCOME_ID, code: 'FEN-1', title: 'Kuvvet', category: 'fizik', examRef: 'TYT', taxonomyVersion: 'v1' },
      { id: SECOND_OUTCOME_ID, code: 'FEN-2', title: 'Hareket', category: 'fizik', examRef: 'TYT', taxonomyVersion: 'v1' },
      { id: NEW_OUTCOME_ID, code: 'FEN-3', title: 'Enerji', category: 'fizik', examRef: 'TYT', taxonomyVersion: 'v1' },
    ] })
    if (url === '/api/admin/content-quality/revisions' && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)))
      return json({ revisionId: REVISION_ID, status: 'draft', replayed: false })
    }
    return json({ error: 'unexpected request' }, 500)
  })
}

describe('AdminQuestionsPage legacy outcome repair', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(REQUEST_ID)
  })

  it('requires a human-selected exact-scope outcome before creating a legacy revision', async () => {
    const posted: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/questions?')) {
        return json({ questions: [{
          id: QUESTION_ID,
          game: 'fen',
          category: 'fizik',
          subcategory: null,
          topic: null,
          difficulty: 2,
          level_tag: null,
          is_active: true,
          is_boss: false,
          source: 'legacy',
          exam_ref: 'TYT',
          times_answered: 10,
          times_correct: 4,
          base_points: 20,
          content: { question: 'Kuvvet nedir?', options: ['A', 'B', 'C', 'D'], correct: 0, solution: 'Açıklama' },
        }], total: 1 })
      }
      if (url.startsWith(`/api/admin/content-quality?questionId=${QUESTION_ID}`)) {
        return json({ revision: {
          revisionId: REVISION_ID,
          metadata: { game: 'fen', category: 'fizik', difficulty: 2, examRef: 'TYT', isBoss: false },
          content: { question: 'Kuvvet nedir?', options: ['A', 'B', 'C', 'D'], answer: 0, solution: 'Açıklama' },
          source: { kind: 'original', title: 'İç kaynak', licenseCode: 'INTERNAL' },
          outcomes: [],
        } })
      }
      if (url.startsWith('/api/admin/content-quality/outcomes?')) {
        return json({ outcomes: [{
          id: OUTCOME_ID,
          code: 'FEN-FIZ-01',
          title: 'Fiziksel akıl yürütme',
          category: 'fizik',
          examRef: 'TYT',
          taxonomyVersion: 'ba-tyt-fen-v1',
        }] })
      }
      if (url === '/api/admin/content-quality/revisions' && init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        return json({ revisionId: REVISION_ID, status: 'draft', replayed: false })
      }
      return json({ error: 'unexpected request' }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<AdminQuestionsPage />)
    await user.click(await screen.findByRole('button', { name: 'Duzenle' }))

    const outcome = await screen.findByRole('combobox', { name: 'Birincil kazanım' })
    const save = screen.getByRole('button', { name: 'Taslak Oluştur' })
    expect(save).toBeDisabled()
    await screen.findByRole('option', { name: /FEN-FIZ-01/ })
    expect(screen.getByText(/kategori adı kazanım kanıtı olarak otomatik atanmaz/i)).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Kategori' }), ' ')
    await screen.findByRole('option', { name: /FEN-FIZ-01/ })
    await user.selectOptions(outcome, OUTCOME_ID)
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({
      questionId: QUESTION_ID,
      baseRevisionId: REVISION_ID,
      requestId: REQUEST_ID,
      payload: {
        metadata: { game: 'fen', category: 'fizik', examRef: 'TYT' },
        outcomes: [{ outcomeId: OUTCOME_ID, weight: 1, primary: true }],
      },
    })
    expect((posted[0].payload as { content: Record<string, unknown> }).content).not.toHaveProperty('correct')
  })

  it('stores a correction as a mapping-pending draft when the catalog has no candidate', async () => {
    const posted: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/questions?')) return json({ questions: [{
        id: QUESTION_ID, game: 'sosyal', category: 'tarih', subcategory: null, topic: null,
        difficulty: 2, level_tag: null, is_active: true, is_boss: false, source: 'legacy',
        exam_ref: null, times_answered: 0, times_correct: 0, base_points: 20,
        content: { question: 'Tarih sorusu', options: ['A', 'B'], answer: 0 },
      }], total: 1 })
      if (url.startsWith(`/api/admin/content-quality?questionId=${QUESTION_ID}`)) return json({ revision: {
        revisionId: REVISION_ID,
        metadata: { game: 'sosyal', category: 'tarih', difficulty: 2, isBoss: false },
        content: { question: 'Tarih sorusu', options: ['A', 'B'], answer: 0 },
        source: { kind: 'original', title: 'İç kaynak', licenseCode: 'INTERNAL', provenanceRef: 'editorial:tyt-social-test' }, outcomes: [],
      } })
      if (url.startsWith('/api/admin/content-quality/outcomes?')) return json({ outcomes: [] })
      if (url === '/api/admin/content-quality/revisions' && init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        return json({ revisionId: REVISION_ID, status: 'draft', mappingRequired: true, replayed: false })
      }
      return json({ error: 'unexpected request' }, 500)
    }))
    const user = userEvent.setup()
    render(<AdminQuestionsPage />)
    await user.click(await screen.findByRole('button', { name: 'Duzenle' }))
    const save = await screen.findByRole('button', { name: 'Kazanım Bekleyen Taslağı Kaydet' })
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ payload: { outcomes: [] } })
    expect(await screen.findByText(/kazanım eşlemesi yapılana kadar 2. aşama ve yayın kapalı/i)).toBeInTheDocument()
  })

  it('makes a general-to-exam reclassification explicit in the editor and revision summary', async () => {
    const posted: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/questions?')) return json({ questions: [{
        id: QUESTION_ID, game: 'fen', category: 'fizik', subcategory: null, topic: null,
        difficulty: 2, level_tag: null, is_active: true, is_boss: false, source: 'legacy',
        exam_ref: null, times_answered: 1, times_correct: 1, base_points: 20,
        content: { question: 'Kuvvet?', options: ['A', 'B'], answer: 0 },
      }], total: 1 })
      if (url.startsWith(`/api/admin/content-quality?questionId=${QUESTION_ID}`)) return json({ revision: {
        revisionId: REVISION_ID,
        metadata: { game: 'fen', category: 'fizik', difficulty: 2, isBoss: false },
        content: { question: 'Kuvvet?', options: ['A', 'B'], answer: 0 },
        source: { kind: 'original', title: 'İç kaynak', licenseCode: 'INTERNAL' }, outcomes: [],
      } })
      if (url.startsWith('/api/admin/content-quality/outcomes?')) {
        const outcomeUrl = new URL(url, 'http://localhost')
        expect(outcomeUrl.searchParams.get('scope')).toBeNull()
        expect(outcomeUrl.searchParams.get('examRef')).toBeNull()
        const category = outcomeUrl.searchParams.get('category') ?? 'fizik'
        return json({ outcomes: [{
          id: OUTCOME_ID, code: category === 'kimya' ? 'FEN-KIM-01' : 'FEN-FIZ-01', title: category, category,
          examRef: 'TYT', taxonomyVersion: 'ba-tyt-fen-v1',
        }] })
      }
      if (url === '/api/admin/content-quality/revisions' && init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        return json({ revisionId: REVISION_ID, status: 'draft', replayed: false })
      }
      return json({ error: 'unexpected request' }, 500)
    }))
    const user = userEvent.setup()
    render(<AdminQuestionsPage />)
    await user.click(await screen.findByRole('button', { name: 'Duzenle' }))
    const categoryInput = screen.getByRole('textbox', { name: 'Kategori' })
    await user.clear(categoryInput)
    await user.type(categoryInput, 'kimya')
    const outcomeSelect = await screen.findByRole('combobox', { name: 'Birincil kazanım' })
    await screen.findByRole('option', { name: /FEN-KIM-01/ })
    await user.selectOptions(outcomeSelect, OUTCOME_ID)
    expect(screen.getByRole('status')).toHaveTextContent('kategori fizik → kimya')
    expect(screen.getByRole('status')).toHaveTextContent('sınav genel → TYT')
    await user.click(screen.getByRole('button', { name: 'Taslak Oluştur' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ payload: {
      metadata: { category: 'kimya', examRef: 'TYT' },
      summary: expect.stringMatching(/Kategori: fizik -> kimya.*Sınav kapsamı: genel -> TYT/),
    } })
  })

  it('strips reviewer enrichment and preserves all weights when promoting an existing secondary outcome', async () => {
    const posted: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', multiOutcomeFetch(posted))
    const user = userEvent.setup()
    render(<AdminQuestionsPage />)
    await user.click(await screen.findByRole('button', { name: 'Duzenle' }))
    const outcomeSelect = await screen.findByRole('combobox', { name: 'Birincil kazanım' })
    await screen.findByRole('option', { name: /FEN-2/ })
    await user.selectOptions(outcomeSelect, SECOND_OUTCOME_ID)
    await user.click(screen.getByRole('button', { name: 'Taslak Oluştur' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    const payload = posted[0].payload as { outcomes: Array<Record<string, unknown>> }
    expect(payload.outcomes).toEqual([
      { outcomeId: OUTCOME_ID, weight: 0.7, primary: false },
      { outcomeId: SECOND_OUTCOME_ID, weight: 0.3, primary: true },
    ])
    expect(payload.outcomes.flatMap((outcome) => Object.keys(outcome).sort()))
      .not.toContain('scopeValid')
  })

  it('does not silently discard secondary mappings when the compact editor selects a new outcome', async () => {
    const posted: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', multiOutcomeFetch(posted))
    const user = userEvent.setup()
    render(<AdminQuestionsPage />)
    await user.click(await screen.findByRole('button', { name: 'Duzenle' }))
    const outcomeSelect = await screen.findByRole('combobox', { name: 'Birincil kazanım' })
    await screen.findByRole('option', { name: /FEN-3/ })
    await user.selectOptions(outcomeSelect, NEW_OUTCOME_ID)
    await user.click(screen.getByRole('button', { name: 'Taslak Oluştur' }))
    expect(await screen.findByText(/birden fazla kazanım var/i)).toBeInTheDocument()
    expect(posted).toHaveLength(0)
  })

  it('requires an explicit legacy rights attestation and submits the edited source fields', async () => {
    const posted: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/questions?')) return json({ questions: [{
        id: QUESTION_ID, game: 'sosyal', category: 'tarih', subcategory: null, topic: null,
        difficulty: 2, level_tag: null, is_active: true, is_boss: false, source: 'legacy',
        exam_ref: 'TYT', times_answered: 0, times_correct: 0, base_points: 20,
        content: { question: 'Tarih sorusu', options: ['A', 'B'], answer: 0 },
      }], total: 1 })
      if (url.startsWith(`/api/admin/content-quality?questionId=${QUESTION_ID}`)) return json({ revision: {
        revisionId: REVISION_ID, changeKind: 'legacy_import',
        metadata: { game: 'sosyal', category: 'tarih', difficulty: 2, examRef: 'TYT', isBoss: false },
        content: { question: 'Tarih sorusu', options: ['A', 'B'], answer: 0 },
        source: {
          kind: 'original', title: 'Legacy kaynak', url: 'https://example.com/old', licenseCode: 'INTERNAL',
          licenseUrl: 'https://example.com/old-license', attribution: 'Eski atıf', provenanceRef: 'legacy:question-1',
        }, outcomes: [],
      } })
      if (url.startsWith('/api/admin/content-quality/outcomes?')) return json({ outcomes: [] })
      if (url === '/api/admin/content-quality/revisions' && init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        return json({ revisionId: REVISION_ID, status: 'draft', mappingRequired: true, replayed: false })
      }
      return json({ error: 'unexpected request' }, 500)
    }))
    const user = userEvent.setup()
    render(<AdminQuestionsPage />)
    await user.click(await screen.findByRole('button', { name: 'Duzenle' }))

    expect(screen.getByLabelText('Kaynak başlığı')).toHaveValue('Legacy kaynak')
    expect(screen.getByLabelText('Kaynak URL')).toHaveValue('https://example.com/old')
    expect(screen.getByLabelText('Lisans kodu')).toHaveValue('INTERNAL')
    expect(screen.getByLabelText('Lisans URL')).toHaveValue('https://example.com/old-license')
    expect(screen.getByLabelText('Atıf')).toHaveValue('Eski atıf')
    expect(screen.getByLabelText('Provenance referansı')).toHaveValue('legacy:question-1')

    const acknowledgement = screen.getByRole('checkbox', { name: /kaynak ve kullanım hakkını doğruladım/i })
    await user.click(acknowledgement)
    expect(acknowledgement).toBeChecked()
    await user.type(screen.getByLabelText('Kaynak başlığı'), ' (doğrulandı)')
    expect(acknowledgement).not.toBeChecked()
    await user.clear(screen.getByLabelText('Kaynak URL'))
    await user.type(screen.getByLabelText('Kaynak URL'), 'https://osym.gov.tr/tyt-sosyal')
    await user.clear(screen.getByLabelText('Lisans URL'))
    await user.type(screen.getByLabelText('Lisans URL'), 'https://osym.gov.tr/kullanim')
    await user.clear(screen.getByLabelText('Atıf'))
    await user.type(screen.getByLabelText('Atıf'), 'ÖSYM resmî sınav dokümanı')
    await user.clear(screen.getByLabelText('Provenance referansı'))
    await user.type(screen.getByLabelText('Provenance referansı'), 'osym:tyt:2026:sosyal:q1')
    await user.click(acknowledgement)

    await user.click(await screen.findByRole('button', { name: 'Kazanım Bekleyen Taslağı Kaydet' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toMatchObject({ payload: {
      source: {
        kind: 'original', title: 'Legacy kaynak (doğrulandı)', url: 'https://osym.gov.tr/tyt-sosyal',
        licenseCode: 'INTERNAL', licenseUrl: 'https://osym.gov.tr/kullanim',
        attribution: 'ÖSYM resmî sınav dokümanı', provenanceRef: 'osym:tyt:2026:sosyal:q1',
      },
      summary: expect.stringContaining('Kaynak ve kullanım hakkı insan tarafından doğrulandı.'),
    } })
  })
})
