import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopGameLobby } from '@/components/academy/desktop-game-lobby'
import { MobileLobbyFlow } from '../mobile-lobby-flow'
import type { LobbyProps } from '../lobby'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))
vi.mock('@/components/layout/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/components/ads/ad-banner', () => ({ AdBanner: () => null }))
vi.mock('@/components/premium/quiz-limit-banner', () => ({ QuizLimitBanner: () => null }))

const makeProps = (): LobbyProps => ({
  game: 'matematik', selectedMode: 'classic', onSelectMode: vi.fn(), onStart: vi.fn(),
  selectedCategory: null, onSelectCategory: vi.fn(), selectedDifficulty: null,
  onSelectDifficulty: vi.fn(), selectedExamRef: 'TYT', onSelectExamRef: vi.fn(),
})

beforeEach(() => { localStorage.clear(); vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true') })
afterEach(() => { vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })

describe.each([
  { name: 'mobil', Component: MobileLobbyFlow, mobile: true },
  { name: 'masaüstü', Component: DesktopGameLobby, mobile: false },
])('$name hazırlık sözleşmesi', ({ Component, mobile }) => {
  it.each([
    { mode: 'classic', name: /^Hızlı[:,]/, action: 'Başla · 10 soru' },
    { mode: 'deneme', name: /^Deneme[:,]/, action: 'Denemeyi başlat · 40 soru' },
    { mode: 'practice', name: /^Pratik[:,]/, action: 'Başla · 10 soru' },
  ])('$mode aynı ad ve başlatma eylemiyle açılır', ({ mode, name, action }) => {
    const props = { ...makeProps(), selectedMode: mode }
    render(<Component {...props} />)
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: action }))
    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it('TYT Sosyal bölümünün 20 soruluk uzunluğunu ve 25 dakikasını korur', () => {
    render(<Component {...makeProps()} game="sosyal" selectedMode="deneme" />)
    expect(screen.getByRole('button', { name: 'Denemeyi başlat · 20 soru' })).toBeEnabled()
    expect(screen.getByText(/25 dk toplam/)).toBeInTheDocument()
  })

  it('misafir denemesi tam tur süresi vaat etmez', () => {
    render(<Component {...makeProps()} selectedMode="deneme" quizLimit={{ canPlay: true, isGuest: true, isPremium: false, remaining: 0 }} />)
    expect(screen.getByRole('button', { name: 'Önizlemeyi başlat · 1 soru' })).toBeEnabled()
    expect(screen.queryByText(/45 dk toplam/)).not.toBeInTheDocument()
  })

  it('özel düğme metni limit kapısını gizlemez ve tur başlatmaz', () => {
    const props = makeProps(), onLimitReached = vi.fn()
    render(<Component {...props} startLabel="Çalışmaya başla" onLimitReached={onLimitReached} quizLimit={{ canPlay: false, isGuest: false, isPremium: false, remaining: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limit doldu · Premium’a geç' }))
    expect(onLimitReached).toHaveBeenCalledOnce()
    expect(props.onStart).not.toHaveBeenCalled()
  })

  it('sınav değişince bağlantıdaki eski kapsamı ve geçersiz konuyu temizler', () => {
    window.history.replaceState(null, '', '/arena/turkce?exam_ref=AYT-SOZ&category=edebiyat&source=program#ayarlar')
    const props = { ...makeProps(), game: 'turkce' as const, selectedExamRef: 'AYT-SOZ', selectedCategory: 'edebiyat' }
    render(<Component {...props} />)
    if (mobile) {
      fireEvent.click(screen.getByRole('button', { name: 'Kapsam seç: AYT Sözel' }))
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Sınav kapsamını seç' })).getByRole('button', { name: /^TYT/ }))
    } else fireEvent.change(screen.getByLabelText('Sınav kapsamı'), { target: { value: 'TYT' } })
    const url = new URL(window.location.href)
    expect(url.searchParams.get('exam_ref')).toBe('TYT')
    expect(url.searchParams.has('category')).toBe(false)
    expect(url.searchParams.get('source')).toBe('program')
    expect(url.hash).toBe('#ayarlar')
    expect(props.onSelectExamRef).toHaveBeenCalledWith('TYT')
  })

  it('konu değişince eski giriş bağlantısı seçimi geri almaz', () => {
    window.history.replaceState(null, '', '/arena/matematik?exam_ref=TYT&category=sayilar&source=study')
    const props = { ...makeProps(), selectedCategory: 'sayilar' }
    render(<Component {...props} />)
    if (mobile) {
      fireEvent.click(screen.getByRole('button', { name: 'Konu seç: Sayılar' }))
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Konu seç' })).getByRole('button', { name: /Problemler/ }))
    } else fireEvent.change(screen.getByLabelText('Konu'), { target: { value: 'problemler' } })
    expect(new URL(window.location.href).searchParams.get('category')).toBe('problemler')
    expect(new URL(window.location.href).searchParams.get('source')).toBe('study')
    expect(props.onSelectCategory).toHaveBeenCalledWith('problemler')
  })

  it('kullanıcı farklı mod seçince pratik giriş tercihini bırakır ve kaynak bilgisini korur', () => {
    window.history.replaceState(null, '', '/arena/matematik?exam_ref=TYT&mode=practice&source=program')
    const props = { ...makeProps(), selectedMode: 'practice' }
    const view = render(<Component {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /^(Hızlı|Klasik)[:,]/ }))
    expect(new URL(window.location.href).searchParams.has('mode')).toBe(false)
    expect(new URL(window.location.href).searchParams.get('source')).toBe('program')
    expect(props.onSelectMode).not.toHaveBeenCalled()
    view.rerender(<Component {...props} />)
    expect(props.onSelectMode).toHaveBeenCalledWith(expect.objectContaining({ id: 'classic' }))
  })
})
