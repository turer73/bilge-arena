import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PersonalizedMockCard } from '../personalized-mock-card'

describe('PersonalizedMockCard', () => {
  it('Akıllı Deneme açıklamasını ve 40 soru CTA’sını gösterir', () => {
    render(<PersonalizedMockCard loading={false} error={null} onStart={vi.fn()} />)
    expect(screen.getByText('AKILLI DENEME')).toBeInTheDocument()
    expect(screen.getByText('40 SORU')).toBeInTheDocument()
    expect(screen.getByText(/Başlangıç tanılaması değildir/)).toBeInTheDocument()
    expect(screen.queryByText(/sınav kapsamın dengelenerek/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Akıllı Denemeyi Başlat/i })).toBeEnabled()
  })

  it('başlatmayı iletir; yüklenirken butonu kilitler', () => {
    const onStart = vi.fn()
    const { rerender } = render(
      <PersonalizedMockCard loading={false} error={null} onStart={onStart} />,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onStart).toHaveBeenCalledOnce()

    rerender(<PersonalizedMockCard loading error={null} onStart={onStart} />)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText('Deneme hazırlanıyor...')).toBeInTheDocument()
  })

  it('üretim hatasını erişilebilir biçimde gösterir', () => {
    render(<PersonalizedMockCard loading={false} error="Yeterli soru yok" onStart={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Yeterli soru yok')
  })
})
