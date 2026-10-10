import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ usePathname: () => '/arena/tani/sosyal-hazirlik' }))
vi.mock('next/link', () => ({ default: ({ href, children }: React.ComponentProps<'a'>) => <a href={href} data-next-link="true">{children}</a> }))
const mocks = vi.hoisted(() => ({ grade: vi.fn(), auth: { user: { id: 'one' }, loading: false } }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/lib/questions/grade-question', () => ({ gradeQuestion: mocks.grade }))
import Client from '../preparation-client'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const context = { available: true, policyVersion: 'tyt-social-2027-v1', examYear: 2027, variant: null, resume: null,
  candidateQuestionCount: 20, bookletQuestionCount: 25, officialExamCertification: false, wholeCurriculumMeasurement: false }
function ticket() { return { attemptId: id(900), expiresAt: '2099-01-01T00:00:00Z', examYear: 2027,
  questions: Array.from({ length: 20 }, (_, i) => ({ id: id(i+1), game: 'sosyal', category: 'tarih', subcategory: null,
    topic: null, level_tag: null, difficulty: 2, base_points: 20, content: { question: `Soru kökü ${i+1}`, passage: 'Öncül korunur.', options: ['bir','iki','üç','dört','beş'] } })), progress: [] as { questionId: string; selectedOption: number; correctOption: number; isCorrect: boolean; solution: string }[] } }
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const choose = async () => { await screen.findByText('Cevaplama düzenini seç'); fireEvent.click(screen.getByLabelText(/1–15 \+ 16–20/)); fireEvent.click(screen.getByRole('checkbox')) }
describe('preparation learner session', () => {
  beforeEach(() => { mocks.auth = { user: { id: 'one' }, loading: false }; mocks.grade.mockReset(); mocks.grade.mockResolvedValue({ isCorrect: true, correctOption: 1, solution: 'İki doğru.' }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  it('requires notice and choice, starts once on a double click and displays passage', async () => {
    let resolve: (r: Response) => void = () => {}
    const fetcher = vi.fn().mockResolvedValueOnce(response(context)).mockImplementation(() => new Promise<Response>(r => { resolve = r }))
    vi.stubGlobal('fetch', fetcher); render(<Client />)
    expect(screen.getByRole('link', { name: 'Sosyal çalışmasına dön' })).not.toHaveAttribute('data-next-link')
    await screen.findByText('Cevaplama düzenini seç'); expect(screen.getByRole('button', { name: '20 soruluk turu başlat' })).toBeDisabled()
    await choose(); const start = screen.getByRole('button', { name: '20 soruluk turu başlat' })
    fireEvent.click(start); fireEvent.click(start); expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () => resolve(response(ticket())))
    expect(await screen.findByText('Soru kökü 1')).toBeInTheDocument(); expect(screen.getByText('Öncül korunur.')).toBeInTheDocument()
  })
  it('resumes from server first-choice progress without storage of private range', async () => {
    const t = ticket(); t.progress = [{ questionId: id(1), selectedOption: 0, correctOption: 1, isCorrect: false, solution: 'İki doğru.' }]
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ...context, resume: { requestId: id(700), variant: 'questions_16_20' } })).mockResolvedValueOnce(response(t))
    vi.stubGlobal('fetch', fetcher); render(<Client />); fireEvent.click(await screen.findByRole('button', { name: 'Kayıtlı tura devam et' }))
    expect(await screen.findByText('Soru kökü 2')).toBeInTheDocument()
    expect(JSON.parse(fetcher.mock.calls[1][1].body).requestId).toBe(id(700))
  })
  it('preserves first choice across a lost grade response and retries the same index', async () => {
    const t = ticket(); const done = { ...t, progress: [{ questionId: id(1), selectedOption: 1, correctOption: 1, isCorrect: true, solution: 'İki doğru.' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response(t)).mockResolvedValueOnce(response(done)))
    mocks.grade.mockRejectedValueOnce(new Error('Bağlantı kesildi'))
    render(<Client />); await choose(); fireEvent.click(screen.getByRole('button', { name: '20 soruluk turu başlat' }))
    await screen.findByText('Soru kökü 1'); fireEvent.click(screen.getByLabelText('B. iki')); fireEvent.click(screen.getByRole('button', { name: 'Cevabı kaydet' }))
    await screen.findByRole('alert'); expect(screen.getByLabelText('A. bir')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı kaydet' })); await screen.findByText('İki doğru.')
    expect(mocks.grade.mock.calls.map(c => c[1])).toEqual([1,1]); expect(screen.getByRole('button', { name: 'Sonraki soru' })).toBeEnabled()
  })
  it('drops late issuance on account change', async () => {
    let late: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(context)).mockImplementationOnce(() => new Promise<Response>(r => { late = r })).mockResolvedValue(response({ available: false })))
    const view = render(<Client />); await choose(); fireEvent.click(screen.getByRole('button', { name: '20 soruluk turu başlat' }))
    mocks.auth = { user: { id: 'two' }, loading: false }; view.rerender(<Client />)
    await act(async () => late(response(ticket())))
    await screen.findByText(/Hazırlık pilotu şu an kullanılamıyor/); expect(screen.queryByText('Soru kökü 1')).not.toBeInTheDocument()
  })
  it('uses persisted server totals, retries completion with the same request', async () => {
    const t = ticket(); t.progress = t.questions.map(q => ({ questionId: q.id, selectedOption: 1, correctOption: 1, isCorrect: true, solution: 'İki doğru.' }))
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ...context, resume: { requestId: id(700), variant: 'questions_16_20' } }))
      .mockResolvedValueOnce(response(t)).mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response({ correctCount: 20, wrongCount: 0 }))
    vi.stubGlobal('fetch', fetcher); render(<Client />); fireEvent.click(await screen.findByRole('button', { name: 'Kayıtlı tura devam et' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Turu tamamla ve kaydet' })); await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Turu tamamla ve kaydet' })); await screen.findByText('Hazırlık turu kaydedildi')
    await waitFor(() => expect(screen.getByText('20 doğru · 0 yanlış / 20 soru')).toBeInTheDocument())
    const requests = fetcher.mock.calls.filter(c => c[0] === '/api/sessions').map(c => JSON.parse(c[1].body))
    expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]); expect(requests[0].answers).toHaveLength(20)
  })
})
