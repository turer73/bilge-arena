import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

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
