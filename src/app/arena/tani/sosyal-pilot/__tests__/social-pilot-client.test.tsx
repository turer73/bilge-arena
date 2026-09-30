import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SOCIAL_DISCOVERY_DESCRIPTION, SOCIAL_DISCOVERY_LABEL } from '@/lib/diagnostic/social-pilot-public'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), hook: vi.fn(), start: vi.fn(), answer: vi.fn(), refresh: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: mocks.auth }))
vi.mock('@/lib/hooks/use-social-pilot', () => ({ useSocialPilot: mocks.hook }))
import SocialPilotClient from '../social-pilot-client'

const base = { supported: true, label: SOCIAL_DISCOVERY_LABEL, description: SOCIAL_DISCOVERY_DESCRIPTION,
  questionCount: 12, session: null }
function hook(response: unknown, error = false) {
  return { response, error, loading: false, submitting: false,
    start: mocks.start, answer: mocks.answer, refresh: mocks.refresh }
}
function active() {
  return { ...base, session: { id: '10000000-0000-4000-8000-000000000001', status: 'active',
    expiresAt: '2099-09-30T12:00:00Z', answeredCount: 0, observations: null,
    question: { id: '20000000-0000-4000-8000-000000000001', category: 'tarih', question: 'Örnek soru?',
      passage: 'Okunması gereken öncül.', options: ['Bir', 'İki', 'Üç', 'Dört', 'Beş'] } } }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockReturnValue({ user: { id: 'user' }, loading: false })
  mocks.hook.mockReturnValue(hook(base))
  mocks.start.mockResolvedValue(true)
  mocks.answer.mockResolvedValue(true)
  mocks.refresh.mockResolvedValue(true)
})
describe('social discovery student flow', () => {
  it('requires login and shows the bounded pilot scope before start', () => {
    mocks.auth.mockReturnValue({ user: null, loading: false })
    render(<SocialPilotClient />)
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/giris?next=%2Farena%2Ftani%2Fsosyal-pilot')
    expect(screen.getByText(SOCIAL_DISCOVERY_DESCRIPTION)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /keşfi başlat/ })).not.toBeInTheDocument()
  })
  it('starts only a supported pilot', async () => {
    const ui = userEvent.setup()
    const { rerender } = render(<SocialPilotClient />)
    await ui.click(screen.getByRole('button', { name: '12 soruluk keşfi başlat' }))
    expect(mocks.start).toHaveBeenCalledOnce()
    mocks.hook.mockReturnValue(hook({ ...base, supported: false }))
    rerender(<SocialPilotClient />)
    expect(screen.queryByRole('button', { name: /keşfi başlat/ })).not.toBeInTheDocument()
  })
  it('shows passage and all options; retries the identical request after a network failure', async () => {
    const ui = userEvent.setup()
    mocks.hook.mockReturnValue(hook(active()))
    mocks.answer.mockResolvedValue(false)
    render(<SocialPilotClient />)
    expect(screen.getByText('Okunması gereken öncül.')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    await ui.click(screen.getAllByRole('radio')[1])
    await ui.click(screen.getByRole('button', { name: 'Cevabı kaydet ve devam et' }))
    await ui.click(screen.getByRole('button', { name: 'Cevabı kaydet ve devam et' }))
    expect(mocks.answer).toHaveBeenCalledTimes(2)
    expect(mocks.answer.mock.calls[0][0]).toEqual(mocks.answer.mock.calls[1][0])
    expect(mocks.answer.mock.calls[0][0]).toMatchObject({ selectedOption: 1, requestId: expect.any(String) })
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
  })
  it('presents raw observations without a mastery percentage or unsupported recommendation', () => {
    mocks.hook.mockReturnValue(hook({ ...base, session: { ...active().session, status: 'completed',
      question: null, answeredCount: 12, observations: ['tarih', 'cografya', 'felsefe', 'sosyoloji']
        .map(category => ({ category, answered: 3, correct: 2 })) } }))
    render(<SocialPilotClient />)
    expect(screen.getByText('Başlangıç gözlemin')).toBeInTheDocument()
    expect(screen.getAllByText('2 / 3 doğru')).toHaveLength(4)
    expect(screen.queryByText('%67')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Hâkimiyet haritası' })).not.toBeInTheDocument()
  })
})
