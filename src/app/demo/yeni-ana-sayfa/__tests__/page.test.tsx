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
    expect(screen.getByRole('link', { name: /öğrenci olarak dene/i })).toHaveAttribute('href', '/arena')
    expect(screen.getByRole('link', { name: 'Küçük dershane pilotu' })).toHaveAttribute('href', '#kurumsal-pilot')
    expect(screen.getByText('Yayın yönetişimi')).toBeVisible()
    expect(screen.getByText(/örnek rota · kişisel veri değil/i)).toBeVisible()
  })

  test('sentetik kurum akışında rol görünümü ve sınırı görünürdür', () => {
    render(<NewHomeDemo />)

    expect(screen.getByText(/sentetik bir ürün akışıdır/i)).toBeVisible()
    const studentTab = screen.getByRole('tab', { name: 'Öğrenci' })
    const teacherTab = screen.getByRole('tab', { name: 'Öğretmen / koç' })
    studentTab.focus()
    fireEvent.keyDown(studentTab, { key: 'ArrowRight' })
    expect(teacherTab).toHaveAttribute('aria-selected', 'true')
    expect(teacherTab).toHaveFocus()

    fireEvent.click(screen.getByRole('tab', { name: 'Kurum yöneticisi' }))
    expect(screen.getByRole('heading', { name: 'Kullanımın nerede aksadığını anlarsın.' })).toBeVisible()
    expect(screen.getByText(/Muhasebe · yoklama · SMS · ERP entegrasyonu/i)).toBeVisible()
    expect(screen.getByRole('link', { name: /pilot kapsamını ilet/i })).toHaveAttribute('href', '/iletisim#kurumsal-pilot')
    expect(screen.getByText(/gerçek müşteri kabulü/i)).toBeVisible()
  })

  test('davetli ücretsiz canary sınırlarını ve ticari kapıyı açık gösterir', () => {
    render(<NewHomeDemo />)

    expect(screen.getByText('14–60 gün')).toBeVisible()
    expect(screen.getByText('En fazla 40')).toBeVisible()
    expect(screen.getByText('Toplam 2')).toBeVisible()
    expect(screen.getByText(/ticari onboarding ve public\/self-servis kurum açılışı kapalı/i)).toBeVisible()
  })

  test('faq yalnız seçilen cevabı açar ve kapanır', () => {
    render(<NewHomeDemo />)
    const question = screen.getByRole('button', { name: /gerçek bir kurum verisi mi/i })
    expect(question).toHaveAttribute('aria-expanded', 'true')
    expect(question).toHaveAttribute('aria-controls', 'faq-answer-0')
    fireEvent.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'false')
  })
})
