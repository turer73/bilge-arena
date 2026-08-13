import { afterEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BilgeTahtaDialog } from '../bilge-tahta-dialog'
import { BilgeTahtaContent } from '../bilge-tahta-content'
import type { BilgeTahtaLesson } from '@/lib/bilge-tahta/contract'

const lesson: BilgeTahtaLesson = {
  mode: 'study',
  subjectLabel: 'Matematik - LGS için oldukça uzun bir ders kapsamı',
  title: 'Kareköklü İfadeler ve Çok Uzun Türkçe Konu Başlığı',
  steps: [
    {
      id: 'concept',
      stage: 'concept',
      title: 'Tam kare sayılar',
      content: '<img src=x onerror="window.__unsafe=true">\nBir tamsayının karesi olan sayılara tam kare denir.',
      formula: '√999999999999999999999999999999999999999999999999999999999 = 999999999999999999999999999',
      sourceLabel: 'Küratörlü içerik',
      guardrailLabel: 'Koruyucu kontrol geçti',
    },
    {
      id: 'example',
      stage: 'worked-example',
      title: 'Çözümlü örnek',
      content: '√72 = √(36 × 2) olduğundan 6√2 olur.',
    },
  ],
}

afterEach(() => {
  document.body.style.overflow = ''
  vi.unstubAllGlobals()
})

describe('BilgeTahtaDialog', () => {
  test('erişilebilir dialog, güvenli içerik ve mobil taşma sözleşmesini render eder', () => {
    const { container } = render(
      <BilgeTahtaDialog open lesson={lesson} onOpenChange={vi.fn()} animate={false} />,
    )

    const dialog = screen.getByRole('dialog', { name: lesson.title })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.className).toContain('max-h-[88dvh]')
    expect(dialog.className).toContain('w-full')
    expect(screen.getByText('<img src=x onerror="window.__unsafe=true">', { exact: false })).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()

    const formula = screen.getByRole('math')
    expect(formula.className).toContain('overflow-x-auto')
    expect(screen.getByText(/Kaynak: Küratörlü içerik/)).toBeInTheDocument()
    expect(screen.getByText('Koruyucu kontrol geçti')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })

  test('adımlar arasında ilerler, tamamlar ve çalışma bağlamına döner', () => {
    const onOpenChange = vi.fn()
    const onReturn = vi.fn()
    const onComplete = vi.fn()
    const onStepViewed = vi.fn()
    render(
      <BilgeTahtaDialog
        open
        lesson={lesson}
        onOpenChange={onOpenChange}
        onReturn={onReturn}
        onComplete={onComplete}
        onStepViewed={onStepViewed}
        animate={false}
      />,
    )

    expect(onStepViewed).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }))
    expect(screen.getByText('Çözümlü örnek')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(onStepViewed).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: /Tamamla/ }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onReturn).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('Escape ile kapanır, gövdeyi kilitler ve odağı açan kontrole geri verir', async () => {
    const launcher = document.createElement('button')
    launcher.textContent = 'Tahtada anlat'
    document.body.appendChild(launcher)
    launcher.focus()
    const onOpenChange = vi.fn()

    const { unmount } = render(
      <BilgeTahtaDialog open lesson={lesson} onOpenChange={onOpenChange} animate={false} />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bilge Tahta’yı kapat' })).toHaveFocus())
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(launcher).toHaveFocus()
    launcher.remove()
  })

  test('oyun modunda güvenli dönüş eylemini her adımda görünür tutar', () => {
    render(
      <BilgeTahtaDialog
        open
        lesson={{ ...lesson, mode: 'game' }}
        onOpenChange={vi.fn()}
        animate={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Soruyu çözmeye dön' })).toBeInTheDocument()
  })

  test('Tab odağını dialog içinde döndürür', async () => {
    render(<BilgeTahtaDialog open lesson={lesson} onOpenChange={vi.fn()} animate={false} />)
    const close = screen.getByRole('button', { name: 'Bilge Tahta’yı kapat' })
    const next = screen.getByRole('button', { name: /Sonraki/ })
    await waitFor(() => expect(close).toHaveFocus())
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(next).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
  })
})

describe('BilgeTahtaContent', () => {
  test('daktilo animasyonunu kullanıcı tek eylemle atlayabilir', () => {
    render(<BilgeTahtaContent step={lesson.steps[0]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Yazıyı hemen göster' }))
    expect(screen.getByTestId('bilge-tahta-text').textContent).toBe(lesson.steps[0].content)
  })

  test('azaltılmış hareket tercihinde metni doğrudan gösterir', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    render(<BilgeTahtaContent step={lesson.steps[0]} />)
    expect(screen.queryByRole('button', { name: 'Yazıyı hemen göster' })).not.toBeInTheDocument()
    expect(screen.getByTestId('bilge-tahta-text').textContent).toBe(lesson.steps[0].content)
  })
})
