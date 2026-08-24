import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockUsePathname = vi.hoisted(() => vi.fn<() => string>())

vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('next/image', () => ({
  default: ({ priority: _priority, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    <img alt={alt ?? ''} {...props} />
  ),
}))

import { coachSeenStorageKey, MobileHomeDemo } from '../mobile-home-demo'

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePathname.mockReturnValue('/mobil-demo')
})

describe('MobileHomeDemo Bilge Chan koç balonu', () => {
  test('ilk mesajla açılır ve kapatma düğmesiyle kapanır', async () => {
    render(<MobileHomeDemo />)

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Hazırsın, Bilgin!' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Koç penceresini kapat' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Chan çağrısından yeniden açılır ve Escape ile kapanır', async () => {
    render(<MobileHomeDemo />)
    fireEvent.click(await screen.findByRole('button', { name: 'Koç penceresini kapat' }))

    fireEvent.click(screen.getByRole('button', { name: 'Bilge Chan mesajlarını aç' }))
    expect(screen.getByRole('dialog')).toBeVisible()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('üç koç mesajında ilerler ve son adımda ders bağlantısını gösterir', async () => {
    render(<MobileHomeDemo />)

    fireEvent.click(await screen.findByRole('button', { name: 'İleri' }))
    expect(screen.getByRole('heading', { name: 'Önce kuralı yakala' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'İleri' }))
    expect(screen.getByRole('heading', { name: 'Yalnızca 4 soru kaldı!' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Başla/ })).toHaveAttribute('href', '/arena/matematik')
  })

  test('ders seçimi içeriği ve hedef bağlantısını günceller', async () => {
    render(<MobileHomeDemo />)

    fireEvent.click(await screen.findByRole('button', { name: 'Koç penceresini kapat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Türkçe' }))

    expect(screen.getByRole('heading', { name: 'Türkçe Yolu' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Paragrafın Yapısı' })).toBeVisible()
    expect(screen.getByRole('link', { name: /DEVAM ET/ })).toHaveAttribute('href', '/arena/turkce')
  })

  test('tablet ve masaüstü koç penceresinde tüm oyunlar seçilebilir', async () => {
    render(<MobileHomeDemo />)

    const dialog = await screen.findByRole('dialog')
    const subjectPicker = within(dialog).getByLabelText('Bilge Chan ders seçimi')
    expect(subjectPicker).toHaveClass('hidden', 'md:flex')

    fireEvent.click(within(subjectPicker).getByRole('button', { name: 'Fen Bilimleri rotasını seç' }))
    expect(screen.getByText(/Atomun Yapısı için 10 soruluk kısa dersin hazır/)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'İleri' }))
    fireEvent.click(screen.getByRole('button', { name: 'İleri' }))
    expect(screen.getByRole('link', { name: /Başla/ })).toHaveAttribute('href', '/arena/fen')
  })

  test('üst ders sekmeleri masaüstünde ortalanır, mobil kısa adları korunur', () => {
    const { container } = render(<MobileHomeDemo />)
    const surface = container.querySelector('[data-arena-home-surface]')
    const tabs = container.querySelector('[data-subject-tabs]')

    expect(surface).toHaveClass('bg-[var(--app-bg)]', 'lg:bg-transparent')
    expect(tabs).toHaveClass('md:justify-center')
    const mathTab = within(tabs as HTMLElement).getByRole('button', { name: 'Mat' })
    expect(mathTab).toHaveAttribute('title', 'Matematik')
    expect(within(mathTab).getByText('Mat')).toHaveClass('md:hidden')
    expect(within(mathTab).getByText('Matematik')).toHaveClass('hidden', 'md:inline')
  })
})

describe('MobileHomeDemo canlı öğrenme yolu', () => {
  test('kalite görevlerini yalnız ayrı yayın kapısı açıkken gösterir', () => {
    const { rerender } = render(<MobileHomeDemo mode="live" />)
    expect(screen.queryByRole('link', { name: /Kalite görevleri/i })).not.toBeInTheDocument()

    rerender(<MobileHomeDemo mode="live" communityQualityEnabled />)
    expect(screen.getByRole('link', { name: /Kalite görevleri/i })).toHaveAttribute('href', '/arena/kalite-gorevleri')
  })

  const strengths = [
    { label: 'Sayılar', percentage: 90, category: 'sayilar', total: 12 },
    { label: 'Problemler', percentage: 30, category: 'problemler', total: 9 },
  ]

  beforeEach(() => {
    mockUsePathname.mockReturnValue('/arena')
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ topics: strengths, game: 'matematik' }),
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('canlı modda adımlar gerçek müfredattan gelir ve ilerleme sayılır', async () => {
    render(<MobileHomeDemo mode="live" userId="user-1" availableSubjects={['matematik']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Koç penceresini kapat' }))

    // Sabit "Ünite 3" metni yerine gercek konu adlari
    expect(await screen.findByRole('link', { name: 'Sayılar dersini aç' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Problemler dersini aç' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Olasılık dersini aç' })).toBeVisible()

    // 6 konudan 1'i tamamlandi -> 0/6 sabit degil
    expect(screen.getAllByText('1 / 6').length).toBeGreaterThan(0)
  })

  test('adımlar ilgili konuya derin bağlantı verir ve kilitli değildir', async () => {
    render(<MobileHomeDemo mode="live" userId="user-1" availableSubjects={['matematik']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Koç penceresini kapat' }))

    const step = await screen.findByRole('link', { name: 'Olasılık dersini aç' })
    expect(step).toHaveAttribute('href', '/arena/matematik?category=olasilik')
    expect(step).not.toHaveAttribute('aria-disabled')

    // Sıradaki konu = tamamlanmamis ilk konu (problemler)
    expect(screen.getByRole('link', { name: /DEVAM ET/ }))
      .toHaveAttribute('href', '/arena/matematik?category=problemler')
  })
})


describe('MobileHomeDemo koç penceresi davranışı', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/arena')
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ topics: [], game: 'matematik' }) })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('canlı modda günde bir kez karşılar, aynı gün tekrar açılmaz', async () => {
    const first = render(<MobileHomeDemo mode="live" userId="user-1" />)
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(window.localStorage.getItem(coachSeenStorageKey('user-1'))).toBe(new Date().toDateString())
    first.unmount()

    render(<MobileHomeDemo mode="live" userId="user-1" />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('otomatik açılmadığında Chan düğmesinden elle açılabilir', () => {
    window.localStorage.setItem(coachSeenStorageKey('user-1'), new Date().toDateString())
    render(<MobileHomeDemo mode="live" userId="user-1" />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bilge Chan mesajlarını aç' }))
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  test('açılınca odak pencereye taşınır ve arka plan inert olur', async () => {
    render(<MobileHomeDemo mode="live" userId="user-1" />)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    expect(document.querySelector('main')).toHaveAttribute('inert')
  })

  test('kapanınca arka plandaki inert kalkar', async () => {
    render(<MobileHomeDemo mode="live" userId="user-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Koç penceresini kapat' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('main')).not.toHaveAttribute('inert')
  })

  test('günlük koç kaydı kullanıcılar arasında paylaşılmaz', async () => {
    window.localStorage.setItem(coachSeenStorageKey('user-1'), new Date().toDateString())
    render(<MobileHomeDemo mode="live" userId="user-2" />)
    expect(await screen.findByRole('dialog')).toBeVisible()
  })
})
