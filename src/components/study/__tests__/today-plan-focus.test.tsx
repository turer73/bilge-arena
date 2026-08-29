import { afterAll, describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TodayPlanFocus } from '../today-plan-focus'
import { useTodayPlan } from '@/lib/hooks/use-today-plan'
import { useGameStore } from '@/stores/game-store'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/lib/hooks/use-today-plan', () => ({
  useTodayPlan: vi.fn(),
}))

const mockedUseTodayPlan = vi.mocked(useTodayPlan)
const oldPaperFlag = process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED

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
    delete process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED
    useGameStore.setState({
      selectedGame: null,
      selectedMode: 'classic',
      selectedCategory: 'problemler',
      selectedDifficulty: 3,
      selectedExamRef: null,
    })
  })

  afterAll(() => {
    if (oldPaperFlag === undefined) delete process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED
    else process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED = oldPaperFlag
  })

  test('userId yoksa hiçbir şey render etmez', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: null, loading: false } as never)
    const { container } = render(<TodayPlanFocus game="matematik" userId={null} />)
    expect(container.innerHTML).toBe('')
  })

  test('plan boşsa tek fallback CTA ve yalnız TYT Matematikte tanılama gösterir', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: null, loading: false } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" examRef="TYT" />)

    expect(screen.getByText(/hazır plan bulunamadı/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /10 soruluk kısa tanılama/i })).toHaveAttribute('href', '/arena/tani')
    fireEvent.click(screen.getByRole('button', { name: 'Derse Başla' }))
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik')
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
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik?start=today-plan')
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
})
