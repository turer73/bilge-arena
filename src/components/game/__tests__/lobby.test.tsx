import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Lobby } from '../lobby'

vi.mock('../streak-badge', () => ({ StreakBadge: () => <div data-testid="streak" /> }))
vi.mock('../sound-toggle', () => ({ SoundToggle: () => <button type="button">Ses</button> }))
vi.mock('../xp-bar', () => ({ XPBar: () => <div data-testid="xp-bar" /> }))
vi.mock('@/components/premium/quiz-limit-banner', () => ({
  QuizLimitBanner: () => <div data-testid="quiz-limit" />,
}))
vi.mock('@/components/ads/ad-banner', () => ({ AdBanner: () => <div data-testid="ad-banner" /> }))

const baseProps = {
  game: 'matematik' as const,
  selectedMode: 'classic',
  onSelectMode: vi.fn(),
  onStart: vi.fn(),
  selectedCategory: null,
  onSelectCategory: vi.fn(),
  selectedDifficulty: null,
  onSelectDifficulty: vi.fn(),
  selectedExamRef: null,
  onSelectExamRef: vi.fn(),
}

describe('Lobby', () => {
  it('mobil tek sütun, tablet ve bilgisayarda iki sütunlu oyun kabuğu kullanır', () => {
    const { container } = render(<Lobby {...baseProps} />)
    const shell = container.querySelector('[data-responsive-game-lobby]')

    expect(shell).toHaveClass('grid-cols-1')
    expect(shell).toHaveClass('md:grid-cols-[minmax(0,1fr)_300px]')
    expect(shell).toHaveClass('lg:grid-cols-[minmax(0,1fr)_340px]')
    expect(shell).toHaveClass('max-w-[1180px]')
  })

  it('varsayılan filtreleri özetler ve ayrıntıları kapalı tutar', () => {
    render(<Lobby {...baseProps} />)

    const filters = screen.getByRole('button', { name: /Soru ayarları/ })
    expect(filters).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Sınav' })).not.toBeInTheDocument()
    expect(filters).toHaveTextContent('Tümü · Tüm konular · Tümü')
  })

  it('önceden seçilmiş filtre varsa ayrıntıları açık getirir', () => {
    render(
      <Lobby
        {...baseProps}
        selectedCategory="problemler"
        selectedDifficulty={3}
        selectedExamRef="TYT"
      />
    )

    expect(screen.getByRole('button', { name: /Soru ayarları/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group', { name: 'Sınav' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TYT (Lise)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Zor' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ayarlar açıldığında filtre seçimini üst bileşene bildirir', () => {
    const onSelectDifficulty = vi.fn()
    render(<Lobby {...baseProps} onSelectDifficulty={onSelectDifficulty} />)

    fireEvent.click(screen.getByRole('button', { name: /Soru ayarları/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Orta' }))

    expect(onSelectDifficulty).toHaveBeenCalledWith(2)
  })

  it('normal durumda oyunu başlatır', () => {
    const onStart = vi.fn()
    render(<Lobby {...baseProps} onStart={onStart} />)

    fireEvent.click(screen.getByRole('button', { name: /Klasik Başlat/ }))

    expect(onStart).toHaveBeenCalledOnce()
  })

  it('limit dolduğunda premium akışını erişilebilir bırakır', () => {
    const onLimitReached = vi.fn()
    render(
      <Lobby
        {...baseProps}
        onLimitReached={onLimitReached}
        quizLimit={{ canPlay: false, remaining: 0, isPremium: false, isGuest: false }}
      />
    )

    const limitButton = screen.getByRole('button', { name: /Limit doldu/ })
    expect(limitButton).toBeEnabled()
    fireEvent.click(limitButton)
    expect(onLimitReached).toHaveBeenCalledOnce()
  })
})
