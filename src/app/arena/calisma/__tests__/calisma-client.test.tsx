/**
 * CalismaClient — ders çalışma hub'ının auth-dalları + kompozisyon smoke testi.
 * Codecov patch-coverage: PR#278 review turu. Cocuk bilesenler izole-mock:
 * burada test edilen sey hub'in dallanmasi, cocuklarin ici kendi testlerinde.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CalismaClient from '../calisma-client'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))
// Lazy StudyAssistant (next/dynamic) — stub'a indirger, chat bundle'i test-disi
vi.mock('next/dynamic', () => ({
  default: () => {
    const DynamicStub = () => <div data-testid="study-assistant-stub" />
    return DynamicStub
  },
}))
vi.mock('@/components/study/today-plan-focus', () => ({
  TodayPlanFocus: () => <div data-testid="today-plan-focus" />,
}))
vi.mock('@/components/study/mastery-action-card', () => ({
  MasteryActionCard: () => <div data-testid="mastery-action-card" />,
}))

const mockedUseAuthStore = vi.mocked(useAuthStore)

describe('CalismaClient', () => {
  beforeEach(() => {
    mockedUseAuthStore.mockReset()
  })

  test('loading durumunda yukleniyor gosterir', () => {
    mockedUseAuthStore.mockReturnValue({ user: null, profile: null, loading: true } as never)
    render(<CalismaClient />)
    expect(screen.getByText(/Yükleniyor/)).toBeInTheDocument()
  })

  test('giris yoksa giris-CTA gosterir (hub icerigi render edilmez)', () => {
    mockedUseAuthStore.mockReturnValue({ user: null, profile: null, loading: false } as never)
    render(<CalismaClient />)
    expect(screen.getByText('Giriş Yapmanız Gerekiyor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Giriş Yap/ })).toHaveAttribute('href', '/giris')
    expect(screen.queryByTestId('today-plan-focus')).not.toBeInTheDocument()
  })

  test('giris varsa baslik + odak-CTA + mastery + inline asistan kompoze edilir', () => {
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)
    expect(screen.getByText('Ders Çalışma Ortamı')).toBeInTheDocument()
    expect(screen.getByTestId('today-plan-focus')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /10 soruluk kısa tanılama/i })).toHaveAttribute('href', '/arena/tani')
    expect(screen.getByTestId('mastery-action-card')).toBeInTheDocument()
    expect(screen.getByTestId('study-assistant-stub')).toBeInTheDocument()
  })
})
