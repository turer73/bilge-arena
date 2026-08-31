import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

const policyMock = vi.hoisted(() => ({
  current: {
    eligible: true,
    status: 'setup_required' as 'setup_required' | 'active' | 'inactive' | 'loading' | 'error',
    loading: false,
    saving: false,
    error: null as string | null,
    variantCode: null as 'questions_16_20' | 'questions_21_25' | null,
    saveSelection: vi.fn(() => Promise.resolve(true)),
    retry: vi.fn(),
  },
}))
vi.mock('@/lib/hooks/use-tyt-social-exam-policy', () => ({
  useTytSocialExamPolicy: () => policyMock.current,
}))

import { TytSocialExamPolicyCard } from '../tyt-social-exam-policy-card'

afterEach(() => {
  policyMock.current = {
    eligible: true,
    status: 'setup_required',
    loading: false,
    saving: false,
    error: null,
    variantCode: null,
    saveSelection: vi.fn(() => Promise.resolve(true)),
    retry: vi.fn(),
  }
})

describe('TytSocialExamPolicyCard', () => {
  test('setup_required has no default radio and uses the exact neutral copy', () => {
    render(<TytSocialExamPolicyCard />)
    expect(screen.getByRole('heading', { name: 'TYT Sosyal cevaplama düzeni' })).toBeInTheDocument()
    expect(screen.getByText('16–20 Din Kültürü ve Ahlak Bilgisi soruları')).toBeInTheDocument()
    expect(screen.getByText('21–25 İlave Felsefe soruları')).toBeInTheDocument()
    expect(screen.getByText('Bu seçim yalnız yeni oluşturulan çalışma/denemelerde geçerlidir; inanç veya muafiyet nedeni kaydedilmez.')).toBeInTheDocument()
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true)
    expect(screen.queryByLabelText(/neden/i)).not.toBeInTheDocument()
  })

  test('active displays the saved choice and saves an intentional change', () => {
    policyMock.current = { ...policyMock.current, status: 'active', variantCode: 'questions_16_20' }
    render(<TytSocialExamPolicyCard />)
    expect(screen.getByRole('radio', { name: '16–20 Din Kültürü ve Ahlak Bilgisi soruları' })).toBeChecked()
    expect(screen.getByText('Kayıtlı seçim')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '21–25 İlave Felsefe soruları' }))
    fireEvent.click(screen.getByRole('button', { name: 'Seçimi güncelle' }))
    expect(policyMock.current.saveSelection).toHaveBeenCalledWith('questions_21_25')
  })

  test('ineligible contexts render nothing', () => {
    policyMock.current = { ...policyMock.current, eligible: false, status: 'inactive' }
    const { container } = render(<TytSocialExamPolicyCard game="fen" examRef="TYT" />)
    expect(container).toBeEmptyDOMElement()
  })
})
