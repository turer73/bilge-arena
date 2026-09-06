import { afterAll, afterEach, describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TodayPlanFocus } from '../today-plan-focus'
import { useTodayPlan } from '@/lib/hooks/use-today-plan'
import { useGameStore } from '@/stores/game-store'
import type { TytSocialExamPolicyState } from '@/lib/hooks/use-tyt-social-exam-policy'
import { TODAY_PLAN_CONTENT_UNAVAILABLE, TODAY_PLAN_CONTENT_UNAVAILABLE_MESSAGE } from '@/lib/study/today-plan-contract'

const policyHook = vi.hoisted(() => vi.fn())
vi.mock('@/lib/hooks/use-tyt-social-exam-policy', () => ({ useTytSocialExamPolicy: policyHook }))

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/lib/hooks/use-today-plan', () => ({
  useTodayPlan: vi.fn(),
}))

const mockedUseTodayPlan = vi.mocked(useTodayPlan)
const oldPaperFlag = process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED
const fetchPlanMock = vi.fn()
const activePolicy: TytSocialExamPolicyState = {
  eligible: true, status: 'active', loading: false, saving: false, error: null,
  policyVersion: 'tyt-social-2026-v1', selectionEffectiveAt: '2026-09-06T10:00:00Z',
  variantCode: 'questions_16_20', saveSelection: vi.fn(), retry: vi.fn(),
}

function mkPlan(questionCount: number, completedIds: string[] = []) {
  return {
    planDate: '2026-07-25',
    game: 'matematik',
    examRef: 'TYT',
    questions: Array.from({ length: questionCount }, (_, index) => ({ id: `q${index}` })) as never,
    completedIds,
    items: Array.from({ length: questionCount }, (_, index) => ({
      questionId: `q${index}`,
      position: index,
      slotType: index < 3 ? 'due' : index < 6 ? 'weak_outcome' : 'current_target',
      sourceType: 'question',
      sourceLabel: 'Test',
      completed: completedIds.includes(`q${index}`),
    })),
    attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }
}

describe('TodayPlanFocus', () => {
  beforeEach(() => {
    pushMock.mockClear()
    mockedUseTodayPlan.mockReset()
    fetchPlanMock.mockReset()
    policyHook.mockReturnValue(activePolicy)
    delete process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED
    useGameStore.setState({
      selectedGame: null,
      selectedMode: 'classic',
      selectedCategory: 'problemler',
      selectedDifficulty: 3,
      selectedExamRef: null,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (oldPaperFlag === undefined) delete process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED
    else process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED = oldPaperFlag
  })

  test('userId yoksa hiçbir şey render etmez', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: null, loading: false } as never)
    const { container } = render(<TodayPlanFocus game="matematik" userId={null} />)
    expect(container.innerHTML).toBe('')
    expect(mockedUseTodayPlan).not.toHaveBeenCalled()
  })

  test('plan boşsa tek fallback CTA ve yalnız TYT Matematikte tanılama gösterir', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: null, loading: false } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" examRef="TYT" />)

    expect(screen.getByText(/hazır plan bulunamadı/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /10 soruluk kısa başlangıç taraması/i })).toHaveAttribute(
      'href',
      '/arena/tani?game=matematik&exam_ref=TYT',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Konumu kendim seçeyim' }))
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik?exam_ref=TYT')
  })

  test('15 olmayan planda dürüst başlık, süre ve karışım gösterir', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: mkPlan(12), loading: false } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" examRef="TYT" />)

    expect(screen.getByText('BUGÜNÜN PLANI · 12 SORU')).toBeInTheDocument()
    expect(screen.getByText(/12 soru · yaklaşık 9 dk/i)).toBeInTheDocument()
    expect(screen.getByText('3 tekrar zamanı')).toBeInTheDocument()
    expect(screen.getByText('3 geliştirilecek')).toBeInTheDocument()
  })

  test('plan CTA bağlamı temizleyip tek-kullanımlık doğrudan başlangıç URL’sine gider', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: mkPlan(15), loading: false } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" examRef="TYT" />)

    fireEvent.click(screen.getByRole('button', { name: 'Planı Başlat · 15 Soru' }))
    const state = useGameStore.getState()
    expect(state.selectedGame).toBe('matematik')
    expect(state.selectedMode).toBe('practice')
    expect(state.selectedCategory).toBeNull()
    expect(state.selectedDifficulty).toBeNull()
    expect(state.selectedExamRef).toBe('TYT')
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik?start=today-plan&exam_ref=TYT')
  })

  test('Wordquest plani null soru kapsami kullanir ve onceki sinav tercihini korur', () => {
    useGameStore.setState({ selectedExamRef: 'AYT-SAY' })
    mockedUseTodayPlan.mockReturnValue({
      plan: { ...mkPlan(15), game: 'wordquest', examRef: null },
      loading: false,
    } as never)

    render(<TodayPlanFocus game="wordquest" userId="u1" examRef="YDT" />)

    expect(mockedUseTodayPlan).toHaveBeenCalledWith('wordquest', 'u1', null, undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Planı Başlat · 15 Soru' }))
    expect(useGameStore.getState()).toMatchObject({
      selectedGame: 'wordquest',
      selectedMode: 'practice',
      selectedCategory: null,
      selectedDifficulty: null,
      selectedExamRef: 'AYT-SAY',
    })
    expect(pushMock).toHaveBeenCalledWith('/arena/wordquest?start=today-plan')
  })

  test('kısmi planda ana ve mobil CTA yalnız kalan soru sayısını söyler', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: mkPlan(15, ['q0', 'q1', 'q2', 'q3', 'q4']), loading: false } as never)
    render(
      <TodayPlanFocus
        game="matematik"
        userId="u1"
        examRef="TYT"
        showStickyMobileAction
      />,
    )

    expect(screen.getByRole('button', { name: 'Devam Et · 10 Soru' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Devam Et: 10 soru' })).toBeInTheDocument()
  })

  test('public flag açıkken kağıt/PDF girişi verir', () => {
    process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED = 'true'
    mockedUseTodayPlan.mockReturnValue({ plan: mkPlan(15), loading: false } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" examRef="TYT" />)
    expect(screen.getByRole('link', { name: /Kağıt \/ PDF paketi/i })).toHaveAttribute(
      'href',
      '/arena/kagit?game=matematik&examRef=TYT',
    )
  })

  test('eksik plan yeniden denenebilir ve öğrenme başarısı iddia etmez', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: null, loading: false, fetchPlan: fetchPlanMock } as never)
    render(<TodayPlanFocus game="fen" userId="u1" examRef="LGS" />)
    fireEvent.click(screen.getByRole('button', { name: 'Planı yeniden dene' }))
    expect(fetchPlanMock).toHaveBeenCalledOnce()
    expect(screen.queryByText(/BUGÜNÜN 15/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /başlangıç taraması/i })).not.toBeInTheDocument()
  })

  test('kalite incelemesi nedeniyle kullanılamayan planı değiştirmeden aynı sınavda manuel çalışmaya yönlendirir', () => {
    mockedUseTodayPlan.mockReturnValue({
      plan: null,
      loading: false,
      unavailableReason: TODAY_PLAN_CONTENT_UNAVAILABLE,
      fetchPlan: fetchPlanMock,
    } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" examRef="TYT" />)

    expect(screen.getByText('Bugünkü plan şu anda başlatılamıyor')).toBeInTheDocument()
    expect(screen.getByText(TODAY_PLAN_CONTENT_UNAVAILABLE_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Planı yeniden dene' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Konumu kendim seçeyim' }))
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik?exam_ref=TYT')
    expect(screen.queryByText(/BUGÜNÜN 15/)).not.toBeInTheDocument()
  })

  test('manuel çalışma profile göre çözülen LGS kapsamını korur ve plan başlatmaz', () => {
    mockedUseTodayPlan.mockReturnValue({
      plan: null, loading: false, unavailableReason: TODAY_PLAN_CONTENT_UNAVAILABLE,
      unavailableExamRef: 'LGS', fetchPlan: fetchPlanMock,
    } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Konumu kendim seçeyim' }))
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik?exam_ref=LGS')
    expect(useGameStore.getState().selectedExamRef).toBe('LGS')
    expect(fetchPlanMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Planı Başlat/ })).not.toBeInTheDocument()
  })

  test('beklerken süresi dolan biletle başlamaz; yeni plan ister', () => {
    const plan = { ...mkPlan(15), expiresAt: new Date(Date.now() + 1000).toISOString() }
    mockedUseTodayPlan.mockReturnValue({ plan, loading: false, fetchPlan: fetchPlanMock } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" examRef="TYT" />)
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(plan.expiresAt) + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Planı Başlat · 15 Soru' }))
    expect(pushMock).not.toHaveBeenCalled()
    expect(fetchPlanMock).toHaveBeenCalledOnce()
  })

  test.each(['loading', 'setup_required', 'error', 'inactive'] as const)('Social %s iken plan istemez veya başlatmaz', (status) => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    policyHook.mockReturnValue({ ...activePolicy, status, loading: status === 'loading', eligible: status !== 'inactive' })
    render(<TodayPlanFocus game="sosyal" userId="u1" examRef="TYT" />)
    expect(mockedUseTodayPlan).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Planı Başlat|Konumu kendim/ })).not.toBeInTheDocument()
  })

  test('Social kaydı sırasında önceki planı gizler, kayıt sonrası planı yeniden bağlar', () => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    mockedUseTodayPlan.mockReturnValue({ plan: { ...mkPlan(15), game: 'sosyal' }, loading: false } as never)
    const { rerender } = render(<TodayPlanFocus game="sosyal" userId="u1" examRef="TYT" />)
    expect(screen.getByRole('button', { name: 'Planı Başlat · 15 Soru' })).toBeInTheDocument()
    policyHook.mockReturnValue({ ...activePolicy, saving: true })
    rerender(<TodayPlanFocus game="sosyal" userId="u1" examRef="TYT" />)
    expect(screen.queryByRole('button', { name: /Planı Başlat/ })).not.toBeInTheDocument()
    policyHook.mockReturnValue({ ...activePolicy, variantCode: 'questions_21_25', selectionEffectiveAt: '2026-09-06T11:00:00Z' })
    rerender(<TodayPlanFocus game="sosyal" userId="u1" examRef="TYT" />)
    fireEvent.click(screen.getByRole('button', { name: 'Planı Başlat · 15 Soru' }))
    expect(pushMock).toHaveBeenCalledWith('/arena/sosyal?start=today-plan&exam_ref=TYT')
  })

  test('çalışma sayfasının Social politika okuması ve kartını çoğaltmaz', () => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    mockedUseTodayPlan.mockReturnValue({ plan: { ...mkPlan(15), game: 'sosyal' }, loading: false } as never)
    render(<TodayPlanFocus game="sosyal" userId="u1" examRef="TYT" tytSocialPolicy={activePolicy} />)
    expect(policyHook).toHaveBeenCalledWith({ game: 'sosyal', examRef: 'TYT', enabled: false })
    expect(screen.queryByRole('heading', { name: 'TYT Sosyal cevaplama düzeni' })).not.toBeInTheDocument()
  })
})
