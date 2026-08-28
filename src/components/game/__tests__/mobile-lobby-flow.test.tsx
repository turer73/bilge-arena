import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileLobbyFlow } from '../mobile-lobby-flow'
import { MODES, type QuizMode } from '@/lib/constants/modes'

function FlowHarness({ initialCategory = null, initialDifficulty = null }: {
  initialCategory?: string | null
  initialDifficulty?: number | null
}) {
  const [mode, setMode] = useState<QuizMode>(MODES[0])
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
      onStart={vi.fn()}
    />
  )
}

describe('MobileLobbyFlow', () => {
  it('serbest başlangıcı sayfa kaydırmalı form yerine dört kararlı adıma böler', () => {
    render(<FlowHarness />)

    expect(screen.getByRole('heading', { name: 'Nasıl oynamak istersin?' })).toBeInTheDocument()
    expect(screen.getByLabelText('1 / 5 adım')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Hangi sınava hazırlanıyorsun?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Neye odaklanalım?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Problemler/ }))
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Hangi seviyede başlayalım?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Orta/ }))
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Turun hazır' })).toBeInTheDocument()
    expect(screen.getByText('Problemler')).toBeInTheDocument()
    expect(screen.getByText('Orta')).toBeInTheDocument()
  })

  it('derin bağlantıdan bilinen konuyu yeniden sormaz', () => {
    render(<FlowHarness initialCategory="sayilar" />)

    expect(screen.getByLabelText('1 / 4 adım')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Hangi sınava hazırlanıyorsun?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Hangi seviyede başlayalım?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Neye odaklanalım?' })).not.toBeInTheDocument()
  })

  it('baska dersten kalan gecersiz konuyu temizleyip konu adimini yeniden gosterir', () => {
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
    expect(screen.getByLabelText('1 / 4 adım')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Hangi sınava hazırlanıyorsun?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Neye odaklanalım?' })).toBeInTheDocument()
  })

  it('deneme seçilince gereksiz konu ve zorluk adımlarını atlar', () => {
    render(<FlowHarness />)

    fireEvent.click(screen.getByRole('button', { name: /Deneme Sınavı/ }))
    expect(screen.getByLabelText('1 / 3 adım')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Hangi sınava hazırlanıyorsun?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByRole('heading', { name: 'Turun hazır' })).toBeInTheDocument()
    expect(screen.getByText('Deneme Sınavı')).toBeInTheDocument()
    expect(screen.getByText(/45 dk/)).toBeInTheDocument()
  })

  it('özet ekranındaki tek ana CTA oyunu başlatır', () => {
    const onStart = vi.fn()
    render(
      <MobileLobbyFlow
        game="fen"
        selectedMode="classic"
        onSelectMode={vi.fn()}
        selectedCategory="fizik"
        onSelectCategory={vi.fn()}
        selectedDifficulty={2}
        onSelectDifficulty={vi.fn()}
        selectedExamRef="TYT"
        onSelectExamRef={vi.fn()}
        onStart={onStart}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Turu Başlat' }))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('mobil kullanicinin oyun icinde sinav kapsamını degistirmesine izin verir', () => {
    render(<FlowHarness initialCategory="sayilar" initialDifficulty={2} />)

    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    fireEvent.click(screen.getByRole('button', { name: /AYT Eşit Ağırlık/ }))
    expect(screen.getByRole('button', { name: /AYT Eşit Ağırlık/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Devam Et/ }))
    expect(screen.getByText('AYT-EA kapsamı')).toBeInTheDocument()
  })
})
