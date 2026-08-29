import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileLobbyFlow } from '../mobile-lobby-flow'
import { MODES, type QuizMode } from '@/lib/constants/modes'

function FlowHarness({
  initialCategory = null,
  initialDifficulty = null,
  initialMode = 'classic',
  onStart = vi.fn(),
}: {
  initialCategory?: string | null
  initialDifficulty?: number | null
  initialMode?: string
  onStart?: () => void
}) {
  const [mode, setMode] = useState<QuizMode>(MODES.find((item) => item.id === initialMode) ?? MODES[0])
  const [category, setCategory] = useState<string | null>(initialCategory)
  const [difficulty, setDifficulty] = useState<number | null>(initialDifficulty)
  const [examRef, setExamRef] = useState<string | null>('TYT')

  return (
    <MobileLobbyFlow
      game="matematik"
      selectedMode={mode.id}
      onSelectMode={setMode}
      selectedCategory={category}
      onSelectCategory={setCategory}
      selectedDifficulty={difficulty}
      onSelectDifficulty={setDifficulty}
      selectedExamRef={examRef}
      onSelectExamRef={setExamRef}
      onStart={onStart}
    />
  )
}

describe('MobileLobbyFlow', () => {
  it('adım sihirbazı yerine tek ekran ve tek ana CTA gösterir', () => {
    render(<FlowHarness />)
    const flow = within(screen.getByTestId('mobile-lobby-flow'))

    expect(flow.getByRole('heading', { name: 'Hemen başla' })).toBeInTheDocument()
    expect(flow.getByRole('group', { name: 'Başlangıç türü' })).toBeInTheDocument()
    expect(flow.getByRole('button', { name: 'Başla · 10 soru' })).toBeInTheDocument()
    expect(flow.queryByRole('button', { name: /Devam Et/ })).not.toBeInTheDocument()
    expect(flow.queryByText(/\/ 4 adım/)).not.toBeInTheDocument()
  })

  it('konuyu sayfayı uzatmadan tek seçimlik alt panelde değiştirir', () => {
    render(<FlowHarness />)
    const flow = within(screen.getByTestId('mobile-lobby-flow'))

    fireEvent.click(flow.getByRole('button', { name: 'Konu seç: Tüm konular' }))
    const dialog = screen.getByRole('dialog', { name: 'Konu seç' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Problemler/ }))

    expect(screen.queryByRole('dialog', { name: 'Konu seç' })).not.toBeInTheDocument()
    expect(flow.getByRole('button', { name: 'Konu seç: Problemler' })).toBeInTheDocument()
  })

  it('sınav kapsamını ve seviyeyi bağımsız alt panellerden seçer', () => {
    render(<FlowHarness />)
    const flow = within(screen.getByTestId('mobile-lobby-flow'))

    fireEvent.click(flow.getByRole('button', { name: 'Kapsam seç: TYT' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Sınav kapsamını seç' })).getByRole('button', { name: /AYT Eşit Ağırlık/ }))
    expect(flow.getByRole('button', { name: 'Kapsam seç: AYT Eşit Ağırlık' })).toBeInTheDocument()

    fireEvent.click(flow.getByRole('button', { name: 'Seviye seç: Karma' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Zorluk' })).getByRole('button', { name: /Orta/ }))
    expect(flow.getByRole('button', { name: 'Seviye seç: Orta' })).toBeInTheDocument()
  })

  it('denemede gereksiz konu ve seviye ayarlarını kaldırır', () => {
    render(<FlowHarness />)
    const flow = within(screen.getByTestId('mobile-lobby-flow'))

    fireEvent.click(flow.getByRole('button', { name: 'Deneme: 40 soru' }))

    expect(flow.getByRole('heading', { name: 'Hemen başla' })).toBeInTheDocument()
    expect(flow.queryByRole('button', { name: /Konu seç:/ })).not.toBeInTheDocument()
    expect(flow.queryByRole('button', { name: /Seviye seç:/ })).not.toBeInTheDocument()
    expect(flow.getByRole('button', { name: 'Denemeyi Başlat · 40 soru' })).toBeInTheDocument()
    expect(flow.queryByText('Tur')).not.toBeInTheDocument()
  })

  it('ileri oyun modlarını ana yüzeyi kalabalıklaştırmadan korur', () => {
    render(<FlowHarness />)
    const flow = within(screen.getByTestId('mobile-lobby-flow'))

    fireEvent.click(flow.getByRole('button', { name: 'Diğer modlar' }))
    const dialog = screen.getByRole('dialog', { name: 'Diğer oyun modları' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Blitz/ }))

    expect(flow.getByRole('heading', { name: 'Hemen başla' })).toBeInTheDocument()
    expect(flow.getByRole('button', { name: /Seçili: Blitz/ })).toBeInTheDocument()
    expect(flow.getByRole('button', { name: 'Başla · 5 soru' })).toBeInTheDocument()
  })

  it('tek ana CTA oyunu doğrudan başlatır', () => {
    const onStart = vi.fn()
    render(<FlowHarness onStart={onStart} />)

    fireEvent.click(within(screen.getByTestId('mobile-lobby-flow')).getByRole('button', { name: 'Başla · 10 soru' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('başka dersten kalan geçersiz konuyu temizler', () => {
    const onSelectCategory = vi.fn()
    render(
      <MobileLobbyFlow
        game="turkce"
        selectedMode="classic"
        onSelectMode={vi.fn()}
        selectedCategory="geometri"
        onSelectCategory={onSelectCategory}
        selectedDifficulty={2}
        onSelectDifficulty={vi.fn()}
        selectedExamRef="TYT"
        onSelectExamRef={vi.fn()}
        onStart={vi.fn()}
      />
    )

    expect(onSelectCategory).toHaveBeenCalledWith(null)
    expect(within(screen.getByTestId('mobile-lobby-flow')).getByRole('button', { name: 'Konu seç: Tüm konular' })).toBeInTheDocument()
  })

  it('alt paneli Escape ile kapatır', () => {
    render(<FlowHarness />)
    const flow = within(screen.getByTestId('mobile-lobby-flow'))

    fireEvent.click(flow.getByRole('button', { name: 'Konu seç: Tüm konular' }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Konu seç' })).not.toBeInTheDocument()
  })
})
