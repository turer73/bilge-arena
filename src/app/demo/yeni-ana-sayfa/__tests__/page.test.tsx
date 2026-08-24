import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

import { NewHomeDemo } from '../new-home-demo'

describe('yeni ana sayfa demosu', () => {
  test('öğrenme akışı ve bir sonraki adım CTA’sını gösterir', () => {
    render(<NewHomeDemo />)

    expect(screen.getByRole('heading', { name: /bir sonraki adımın hazır/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /öğrenmeye başla/i })).toHaveAttribute('href', '/arena')
    expect(screen.getByRole('link', { name: 'İşleyişi gör' })).toHaveAttribute('href', '#isleyis')
    expect(screen.getByText('Kalite kapısı')).toBeVisible()
  })

  test('sentetik kurum akışında rol görünümü ve sınırı görünürdür', () => {
    render(<NewHomeDemo />)

    expect(screen.getByText(/sentetik bir ürün akışıdır/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Kurum yöneticisi' }))
    expect(screen.getByRole('heading', { name: 'Kullanımın nerede aksadığını anlarsın.' })).toBeVisible()
    expect(screen.getByText(/Muhasebe · yoklama · SMS · ERP entegrasyonu/i)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Kurumsal pilotu konuşalım' })).toHaveAttribute('href', '/iletisim')
  })

  test('faq yalnız seçilen cevabı açar ve kapanır', () => {
    render(<NewHomeDemo />)
    const question = screen.getByRole('button', { name: /gerçek bir kurum verisi mi/i })
    expect(question).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'false')
  })
})
