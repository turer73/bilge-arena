import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ usePathname: () => '/arena/olcum' }))
const mocks = vi.hoisted(() => ({ auth: { user: { id: 'one' }, loading: false } }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => mocks.auth }))
import Client from '../measurement-client'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ticket = (position = 1) => ({ id: id(1), formId: id(2), game: 'matematik', examRef: 'TYT', examYear: 2027,
  protocol: 'closed-measurement@1', status: 'active', answered: position-1, questionCount: 5,
  expiresAt: '2099-01-01T00:00:00Z', question: { id: id(10+position), position, text: `Soru ${position}`, passage: 'Öncül',
    options: ['bir', 'iki', 'üç', 'dört', 'beş'] }, feedback: null, calibrated: false })
const context = () => ({ forms: [{ id: id(2), game: 'matematik', examRef: 'TYT', examYear: 2027, questionCount: 5 }], session: null })
describe('measurement learner', () => {
  beforeEach(() => { mocks.auth = { user: { id: 'one' }, loading: false } })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  it('requires opt-in, presents passage and does not grade via practice', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(context())).mockResolvedValueOnce(response(ticket())).mockResolvedValueOnce(response(ticket())).mockResolvedValueOnce(response(ticket(2)))
    vi.stubGlobal('fetch', fetcher); render(<Client />)
    expect(await screen.findByRole('button', { name: 'Turu başlat' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Ölçüm formu'), { target: { value: id(2) } })
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Turu başlat' }))
    expect(await screen.findByText('Öncül')).toBeInTheDocument()
    expect(screen.getByLabelText('A. bir')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Gösterim durumunu kaydet ve cevapla' }))
    await screen.findByRole('button', { name: 'Cevabı kilitle ve devam et' })
    fireEvent.click(screen.getByLabelText('A. bir')); fireEvent.click(screen.getByRole('button', { name: 'Cevabı kilitle ve devam et' }))
    await screen.findByText('Soru 2')
    expect(fetcher.mock.calls.every(c => c[0] === '/api/study/measurement')).toBe(true)
    expect(screen.queryByText(/Doğru cevap:/)).not.toBeInTheDocument()
  })
  it('retries exactly the same locked answer after connection loss', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ ...context(), session: ticket() })).mockResolvedValueOnce(response(ticket()))
      .mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response(ticket(2)))
    vi.stubGlobal('fetch', fetcher); render(<Client />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gösterim durumunu kaydet ve cevapla' }))
    await screen.findByRole('button', { name: 'Cevabı kilitle ve devam et' })
    fireEvent.click(screen.getByLabelText('B. iki')); fireEvent.click(screen.getByRole('button', { name: 'Cevabı kilitle ve devam et' }))
    await screen.findByRole('alert'); expect(screen.getByLabelText('A. bir')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Aynı cevabı tekrar gönder' })); await screen.findByText('Soru 2')
    expect(fetcher.mock.calls[2][1].body).toBe(fetcher.mock.calls[3][1].body)
  })
  it('drops late responses on account switch', async () => {
    let finish: (r: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(r => { finish = r }))
      .mockResolvedValue(response({ forms: [], session: null })))
    const view = render(<Client />); mocks.auth = { user: { id: 'two' }, loading: false }; view.rerender(<Client />)
    await act(async () => finish(response({ ...context(), session: ticket() })))
    expect(await screen.findByText(/Kaynak, kazanım ve ölçüm formu/)).toBeInTheDocument(); expect(screen.queryByText('Soru 1')).not.toBeInTheDocument()
  })
  it('withdrawn sessions can be abandoned without leaking feedback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...context(), session: { ...ticket(), status: 'withdrawn', question: null } })))
    render(<Client />); expect(await screen.findByRole('button', { name: 'Turu bırak' })).toBeEnabled()
    expect(screen.queryByText('Soru 1')).not.toBeInTheDocument()
  })
})
