import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Sinav modu davranis testi.
 *
 * Global test setup'i yardimcilari ACIK mock'lar; burada o mock ezilerek
 * sinav modunun her yuzeyde ayni sonucu urettigi dogrulanir: tahta girisi
 * ve ders calisma asistani hic cizilmez.
 */
const canUseHelper = vi.hoisted(() => vi.fn())
const useAssistancePolicy = vi.hoisted(() => vi.fn(() => ({
  policy: { examMode: true, board: false, coach: false, assistant: false, until: null },
  loading: false,
})))
vi.mock('@/lib/assistance-policy/client', () => ({ useAssistancePolicy, canUseHelper }))
vi.mock('@/lib/bilge-tahta/analytics', () => ({ trackBilgeBoardEvent: vi.fn() }))

const { TopicExplanationButton } = await import('@/components/bilge-tahta/topic-explanation-button')
const { StudyAssistantLauncher } = await import('@/components/study/study-assistant-launcher')

describe('sınav modu bütün yardımcıları kapatır', () => {
  beforeEach(() => {
    canUseHelper.mockReset()
  })

  test('tahta girişi (konu anlatımı düğmesi) çizilmez', () => {
    canUseHelper.mockReturnValue(false)
    const { container } = render(
      <TopicExplanationButton
        topic="Fonksiyonlar"
        subject="matematik"
        questionContext="test"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('ders çalışma asistanı çizilmez', () => {
    canUseHelper.mockReturnValue(false)
    const { container } = render(<StudyAssistantLauncher game="matematik" examRef="TYT" />)
    expect(container).toBeEmptyDOMElement()
  })

  test('sınav modu kapalıyken ikisi de görünür', () => {
    canUseHelper.mockReturnValue(true)
    render(
      <TopicExplanationButton
        topic="Fonksiyonlar"
        subject="matematik"
        questionContext="test"
      />,
    )
    render(<StudyAssistantLauncher game="matematik" examRef="TYT" />)
    expect(screen.getByRole('heading', { name: 'Bilge Asistan' })).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})
