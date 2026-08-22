import { fireEvent, render, screen } from '@testing-library/react'
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

import { MobileHomeDemo } from '../mobile-home-demo'

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePathname.mockReturnValue('/mobil-demo')
})

describe('MobileHomeDemo Bilge Chan koç balonu', () => {
  test('ilk mesajla açılır ve kapatma düğmesiyle kapanır', () => {
    render(<MobileHomeDemo />)

    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Hazırsın, Bilgin!' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Koç penceresini kapat' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Chan çağrısından yeniden açılır ve Escape ile kapanır', () => {
    render(<MobileHomeDemo />)
    fireEvent.click(screen.getByRole('button', { name: 'Koç penceresini kapat' }))

    fireEvent.click(screen.getByRole('button', { name: 'Bilge Chan mesajlarını aç' }))
    expect(screen.getByRole('dialog')).toBeVisible()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('üç koç mesajında ilerler ve son adımda ders bağlantısını gösterir', () => {
    render(<MobileHomeDemo />)

    fireEvent.click(screen.getByRole('button', { name: 'İleri' }))
    expect(screen.getByRole('heading', { name: 'Önce kuralı yakala' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'İleri' }))
    expect(screen.getByRole('heading', { name: 'Yalnızca 4 soru kaldı!' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Başla/ })).toHaveAttribute('href', '/arena/matematik')
  })

  test('ders seçimi içeriği ve hedef bağlantısını günceller', () => {
    render(<MobileHomeDemo />)

    fireEvent.click(screen.getByRole('button', { name: 'Koç penceresini kapat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Türkçe' }))

    expect(screen.getByRole('heading', { name: 'Türkçe Yolu' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Paragrafın Yapısı' })).toBeVisible()
    expect(screen.getByRole('link', { name: /DEVAM ET/ })).toHaveAttribute('href', '/arena/turkce')
  })
})

describe('MobileHomeDemo canlı öğrenme yolu', () => {
  const strengths = [
    { label: 'Sayılar', percentage: 90, category: 'sayilar', total: 12 },
    { label: 'Problemler', percentage: 30, category: 'problemler', total: 9 },
  ]

  beforeEach(() => {
    mockUsePathname.mockReturnValue('/arena')
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
    fireEvent.click(screen.getByRole('button', { name: 'Koç penceresini kapat' }))

    // Sabit "Ünite 3" metni yerine gercek konu adlari
    expect(await screen.findByRole('link', { name: 'Sayılar dersini aç' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Problemler dersini aç' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Olasılık dersini aç' })).toBeVisible()

    // 6 konudan 1'i tamamlandi -> 0/6 sabit degil
    expect(screen.getAllByText('1 / 6').length).toBeGreaterThan(0)
  })

  test('adımlar ilgili konuya derin bağlantı verir ve kilitli değildir', async () => {
    render(<MobileHomeDemo mode="live" userId="user-1" availableSubjects={['matematik']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Koç penceresini kapat' }))

    const step = await screen.findByRole('link', { name: 'Olasılık dersini aç' })
    expect(step).toHaveAttribute('href', '/arena/matematik?category=olasilik')
    expect(step).not.toHaveAttribute('aria-disabled')

    // Sıradaki konu = tamamlanmamis ilk konu (problemler)
    expect(screen.getByRole('link', { name: /DEVAM ET/ }))
      .toHaveAttribute('href', '/arena/matematik?category=problemler')
  })
})
