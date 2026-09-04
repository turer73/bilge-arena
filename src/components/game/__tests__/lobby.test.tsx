import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('mobil tek sütun, tablet ve bilgisayarda iki sütunlu oyun kabuğu kullanır', () => {
    const { container } = render(<Lobby {...baseProps} />)
    const shell = container.querySelector('[data-responsive-game-lobby]')

    expect(shell).toHaveClass('grid-cols-1')
    expect(shell).toHaveClass('md:grid-cols-[minmax(0,1fr)_300px]')
    expect(shell).toHaveClass('lg:grid-cols-[minmax(0,1fr)_340px]')
    expect(shell).toHaveClass('max-w-[1180px]')
    expect(shell).toHaveClass('bg-[var(--app-bg)]', 'lg:bg-transparent')
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

  it('TYT Türkçe filtresinde AYT edebiyat kategorisini göstermez', () => {
    render(<Lobby {...baseProps} game="turkce" selectedExamRef="TYT" />)

    expect(screen.queryByRole('button', { name: 'Edebiyat' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paragraf' })).toBeInTheDocument()
  })

  it('Sosyal sınav kapsamını filtresiz bıraktırmaz ve TYTyi güvenli varsayılan gösterir', () => {
    render(<Lobby {...baseProps} game="sosyal" selectedExamRef={null} />)

    const filters = screen.getByRole('button', { name: /Soru ayarları/ })
    expect(filters).toHaveTextContent('TYT (Lise)')
    fireEvent.click(filters)
    const examGroup = screen.getByRole('group', { name: 'Sınav' })
    expect(within(examGroup).queryByRole('button', { name: 'Tümü' })).not.toBeInTheDocument()
    expect(within(examGroup).getByRole('button', { name: 'TYT (Lise)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('TYT Sosyal denemesini 20 soruluk exact bölüm olarak anlatır', () => {
    render(
      <Lobby
        {...baseProps}
        game="sosyal"
        selectedExamRef="TYT"
        selectedMode="deneme"
      />,
    )

    expect(screen.getAllByText(/20 soru/).length).toBeGreaterThan(0)
    expect(screen.getByText(/20 soruluk TYT Sosyal bölüm yapısı/)).toBeInTheDocument()
    expect(screen.queryByText(/TYT formatında/)).not.toBeInTheDocument()
    expect(screen.getByText('Seçtiğin cevaplama grubu')).toBeInTheDocument()
  })

  it('learner rollout kapalıyken Sosyal legacy deneme kapsamını korur', () => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'false')
    render(
      <Lobby
        {...baseProps}
        game="sosyal"
        selectedExamRef="TYT"
        selectedMode="deneme"
      />,
    )

    expect(screen.getByText(/Ders kapsamlı çalışma denemesi/)).toBeInTheDocument()
    expect(screen.queryByText(/20 soruluk TYT Sosyal bölüm yapısı/)).not.toBeInTheDocument()
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

  it('politika hazır değilken masaüstü ve mobil başlangıç eylemlerini görünür biçimde devre dışı bırakır', () => {
    const onStart = vi.fn()
    render(
      <Lobby
        {...baseProps}
        onStart={onStart}
        startBlocked
        startBlockedLabel="Cevaplama düzenini seç"
      />,
    )

    const buttons = screen.getAllByRole('button', { name: 'Cevaplama düzenini seç' })
    expect(buttons).toHaveLength(2)
    buttons.forEach(button => expect(button).toBeDisabled())
    buttons.forEach(button => fireEvent.click(button))
    expect(onStart).not.toHaveBeenCalled()
  })

  it('misafir başlangıcını masaüstü ve mobilde aynı güvenli giriş adresine bağlar', () => {
    render(
      <Lobby
        {...baseProps}
        startHref="/giris?redirect=%2Farena%2Fsosyal%3Fexam_ref%3DTYT"
        startLabel="Giriş yaparak başla"
      />,
    )

    const links = screen.getAllByRole('link', { name: 'Giriş yaparak başla' })
    expect(links).toHaveLength(2)
    links.forEach(link => expect(link).toHaveAttribute(
      'href',
      '/giris?redirect=%2Farena%2Fsosyal%3Fexam_ref%3DTYT',
    ))
  })

  it('akıllı denemeyi klasik başlat alanının altında sağ sütuna yerleştirir', () => {
    const { container } = render(
      <Lobby {...baseProps} personalizedMockCard={<div>Akıllı Deneme</div>} />
    )

    const startButton = screen.getByRole('button', { name: /Klasik Başlat/ })
    const slot = container.querySelector('[data-personalized-mock-slot]')

    expect(slot).toHaveClass('md:col-start-2', 'md:row-start-4')
    expect(slot).toHaveTextContent('Akıllı Deneme')
    expect(startButton.compareDocumentPosition(slot as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('akıllı denemeyi mobilde ana başlangıç akışının altında ikincil tutar', () => {
    const { container } = render(
      <Lobby {...baseProps} personalizedMockCard={<div>Akıllı Deneme</div>} />
    )

    const flow = container.querySelector('[data-mobile-lobby-flow]')
    const mobileSlot = container.querySelector('[data-personalized-mock-mobile-slot]')
    expect(mobileSlot).toHaveClass('md:hidden')
    expect(mobileSlot).toHaveTextContent('Akıllı Deneme')
    expect((flow as Element).compareDocumentPosition(mobileSlot as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

    const limitButton = within(screen.getByTestId('mobile-lobby-flow')).getByRole('button', { name: /Limit doldu/ })
    expect(limitButton).toBeEnabled()
    fireEvent.click(limitButton)
    expect(onLimitReached).toHaveBeenCalledOnce()
  })
})
