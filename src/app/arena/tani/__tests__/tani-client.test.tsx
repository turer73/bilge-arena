import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const {
  mockRouterPush,
  mockUseAuthStore,
  mockUseGameStore,
  mockUseDiagnostic,
  mockSetGame,
  mockSetCategory,
  mockSetExamRef,
  mockSetDifficulty,
  mockSetMode,
  mockStart,
  mockAnswer,
  mockRefresh,
} = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockUseAuthStore: vi.fn(),
  mockUseGameStore: vi.fn(),
  mockUseDiagnostic: vi.fn(),
  mockSetGame: vi.fn(),
  mockSetCategory: vi.fn(),
  mockSetExamRef: vi.fn(),
  mockSetDifficulty: vi.fn(),
  mockSetMode: vi.fn(),
  mockStart: vi.fn(async () => true),
  mockAnswer: vi.fn(async () => true),
  mockRefresh: vi.fn(async () => true),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: mockUseAuthStore }))
vi.mock('@/stores/game-store', () => ({ useGameStore: mockUseGameStore }))
vi.mock('@/lib/hooks/use-adaptive-diagnostic', () => ({ useAdaptiveDiagnostic: mockUseDiagnostic }))

import TaniClient from '../tani-client'

const SESSION_ID = '22222222-3333-4444-8555-666666666666'
const QUESTION_ID = '20000000-0000-4000-8000-000000000001'
const QUESTION = {
  id: QUESTION_ID,
  game: 'matematik',
  category: 'sayilar',
  subcategory: null,
  topic: null,
  difficulty: 3,
  level_tag: null,
  base_points: 30,
  content: { question: '2 + 2 kaçtır?', options: ['3', '4', '5', '6'] },
}

const OUTCOMES = [
  ['MAT-SAY', 'Sayılar', 'sayilar', 15, 2],
  ['MAT-DEN', 'Denklemler', 'denklemler', 45, 3],
  ['MAT-FON', 'Fonksiyonlar', 'fonksiyonlar', 75, 4],
  ['MAT-PRO', 'Problemler', 'problemler', 60, 3],
  ['MAT-GEO', 'Geometri', 'geometri', 80, 4],
  ['MAT-OLA', 'Olasılık', 'olasilik', 55, 3],
].map(([code, title, category, score, difficulty]) => ({
  code,
  title,
  category,
  attempts: 2,
  correctAttempts: Number(score) >= 70 ? 2 : 1,
  score,
  recommendedDifficulty: difficulty,
  band: Number(score) < 40 ? 'foundation' : Number(score) < 70 ? 'developing' : 'strong',
}))

function diagnostic(overrides: Record<string, unknown> = {}) {
  const response = {
    supported: true,
    game: 'matematik',
    examRef: 'TYT',
    session: null,
    summary: null,
  }
  return {
    response,
    session: null,
    summary: null,
    supported: true,
    loading: false,
    submitting: false,
    error: null,
    start: mockStart,
    answer: mockAnswer,
    refresh: mockRefresh,
    ...overrides,
  }
}

describe('TaniClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthStore.mockReturnValue({ user: { id: 'u1' }, loading: false })
    mockUseGameStore.mockReturnValue({
      setGame: mockSetGame,
      setCategory: mockSetCategory,
      setExamRef: mockSetExamRef,
      setDifficulty: mockSetDifficulty,
      setMode: mockSetMode,
    })
    mockUseDiagnostic.mockReturnValue(diagnostic())
  })

  it('gates private diagnostics behind authentication', () => {
    mockUseAuthStore.mockReturnValue({ user: null, loading: false })
    render(<TaniClient />)
    expect(screen.getByText('Giriş Yapmanız Gerekiyor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute('href', '/giris')
  })

  it('shows the bounded, no-reward intro and starts the pilot', async () => {
    const user = userEvent.setup()
    render(<TaniClient />)
    expect(screen.getByText(/10 SORU/)).toBeInTheDocument()
    expect(screen.getByText(/ödül ve sıralamayı etkilemez/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Tanılamayı başlat/i }))
    expect(mockStart).toHaveBeenCalledTimes(1)
  })

  it('renders one accessible question and submits only the selected option', async () => {
    const user = userEvent.setup()
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('33333333-4444-4555-8666-777777777777')
    const session = {
      id: SESSION_ID,
      kind: 'initial',
      status: 'active',
      expiresAt: '2099-08-08T12:00:00.000Z',
      progress: { answered: 0, total: 10, coveredOutcomes: 0, totalOutcomes: 6 },
      question: QUESTION,
    }
    mockUseDiagnostic.mockReturnValue(diagnostic({
      response: { supported: true, game: 'matematik', examRef: 'TYT', session, summary: null },
      session,
    }))
    render(<TaniClient />)

    expect(screen.getByRole('progressbar', { name: 'Tanılama ilerlemesi' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('group', { name: '2 + 2 kaçtır?' })).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /Cevabı kaydet/i })
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /B\.4/ }))
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(mockAnswer).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: SESSION_ID,
      questionId: QUESTION_ID,
      selectedOption: 1,
      requestId: '33333333-4444-4555-8666-777777777777',
      responseTimeMs: expect.any(Number),
    }))
    expect(screen.queryByText(/doğru yaptın|yanlış yaptın/i)).not.toBeInTheDocument()
    randomUuid.mockRestore()
  })

  it('keeps an action error explicit and offers safe retry language', () => {
    const session = {
      id: SESSION_ID,
      kind: 'initial',
      status: 'active',
      expiresAt: '2099-08-08T12:00:00.000Z',
      progress: { answered: 2, total: 10, coveredOutcomes: 2, totalOutcomes: 6 },
      question: QUESTION,
    }
    mockUseDiagnostic.mockReturnValue(diagnostic({ session, error: 'action' }))
    render(<TaniClient />)
    expect(screen.getByRole('alert')).toHaveTextContent(/aynı cevabı güvenle yeniden gönderebilirsin/i)
  })

  it('shows a six-outcome summary and routes the weakest outcome into exact practice filters', async () => {
    const user = userEvent.setup()
    const summary = { completedAt: '2026-08-08T12:00:00.000Z', outcomes: OUTCOMES }
    const session = {
      id: SESSION_ID,
      kind: 'initial',
      status: 'completed',
      expiresAt: '2099-08-08T12:00:00.000Z',
      progress: { answered: 10, total: 10, coveredOutcomes: 6, totalOutcomes: 6 },
      question: null,
    }
    mockUseDiagnostic.mockReturnValue(diagnostic({ session, summary }))
    render(<TaniClient />)
    expect(screen.getByText(/KEŞİF ADIMI TAMAM/)).toBeInTheDocument()
    expect(screen.getByText(/Keşif Seviyesi 2/)).toBeInTheDocument()
    expect(screen.getByText('Kazanım özeti')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: /Önce Sayılar çalış/i }))
    expect(mockSetGame).toHaveBeenCalledWith('matematik')
    expect(mockSetCategory).toHaveBeenCalledWith('sayilar')
    expect(mockSetExamRef).toHaveBeenCalledWith('TYT')
    expect(mockSetDifficulty).toHaveBeenCalledWith(2)
    expect(mockSetMode).toHaveBeenCalledWith('practice')
    expect(mockRouterPush).toHaveBeenCalledWith('/arena/matematik')
  })

  it('labels expired sessions and retries a failed load', async () => {
    const user = userEvent.setup()
    mockUseDiagnostic.mockReturnValue(diagnostic({ response: null, error: 'load' }))
    const { rerender } = render(<TaniClient />)
    await user.click(screen.getByRole('button', { name: /Yeniden dene/i }))
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    const expired = {
      id: SESSION_ID,
      kind: 'initial',
      status: 'expired',
      expiresAt: '2026-08-08T10:00:00.000Z',
      progress: { answered: 3, total: 10, coveredOutcomes: 3, totalOutcomes: 6 },
      question: null,
    }
    mockUseDiagnostic.mockReturnValue(diagnostic({ session: expired }))
    rerender(<TaniClient />)
    expect(screen.getByRole('status')).toHaveTextContent(/süresi doldu/i)
  })
})
