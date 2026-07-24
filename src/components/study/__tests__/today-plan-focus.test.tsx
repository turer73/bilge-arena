/**
 * TodayPlanFocus — hub'ın tek-odak "Bugünün 15'i" CTA sarmalayıcısı.
 * Codecov patch-coverage: PR#278 review turu (dallar: anon / empty-state / plan-var).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TodayPlanFocus } from '../today-plan-focus'
import { useTodayPlan } from '@/lib/hooks/use-today-plan'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/lib/hooks/use-today-plan', () => ({
  useTodayPlan: vi.fn(),
}))

const mockedUseTodayPlan = vi.mocked(useTodayPlan)

function mkPlan(questionCount: number) {
  return {
    planDate: '2026-07-25',
    game: 'matematik',
    examRef: 'TYT',
    questions: Array.from({ length: questionCount }, (_, i) => ({ id: `q${i}` })) as never,
    completedIds: [],
  }
}

describe('TodayPlanFocus', () => {
  beforeEach(() => {
    pushMock.mockClear()
    mockedUseTodayPlan.mockReset()
  })

  test('userId yoksa hicbir sey render etmez', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: null, loading: false } as never)
    const { container } = render(<TodayPlanFocus game="matematik" userId={null} />)
    expect(container.innerHTML).toBe('')
  })

  test('plan bos ise empty-state + "Ilk Planini Olustur" CTA gosterir ve oyuna yonlendirir', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: null, loading: false } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" />)
    expect(screen.getByText(/hazır bir plan yok/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /İlk Planını Oluştur/ }))
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik')
  })

  test('plan varsa TodayPlanCard render edilir (empty-state gorunmez)', () => {
    mockedUseTodayPlan.mockReturnValue({ plan: mkPlan(15), loading: false } as never)
    render(<TodayPlanFocus game="matematik" userId="u1" />)
    expect(screen.queryByText(/hazır bir plan yok/i)).not.toBeInTheDocument()
    // TodayPlanCard'in baslik bandi (gercek bilesen, mock degil)
    expect(screen.getByText(/BUGÜNÜN 15/)).toBeInTheDocument()
  })
})
