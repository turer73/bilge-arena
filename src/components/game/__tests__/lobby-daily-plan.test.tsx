import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodayPlan } from '@/lib/hooks/use-today-plan'
import { LobbyDailyPlan } from '../lobby-daily-plan'

const plan = {
  questions: [{ id: 'q1' }, { id: 'q2' }], completedIds: ['q1'],
} as TodayPlan

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function(this: HTMLDialogElement) { this.setAttribute('open', '') },
  })
})

describe('Lobby daily plan shortcut', () => {
  it('shows real progress and an explicit review action without starting a game', () => {
    const onStart = vi.fn(() => true)
    const { rerender } = render(<LobbyDailyPlan plan={plan} loading={false} onStart={onStart} />)
    const trigger = screen.getByRole('button', { name: 'Günlük planın' })
    expect(trigger).toHaveTextContent('Planı incele')
    expect(trigger).toHaveAccessibleDescription('1/2 soru tamamlandı')
    expect(trigger.querySelector('img')).toHaveAttribute('alt', '')
    rerender(<LobbyDailyPlan plan={{ ...plan, completedIds: [] }} loading={false} onStart={onStart} />)
    expect(trigger).toHaveAccessibleDescription('2 soruluk kişisel tur')
    rerender(<LobbyDailyPlan plan={{ ...plan, completedIds: ['q1', 'q2', 'unrelated'] }} loading={false} onStart={onStart} />)
    expect(trigger).toHaveAccessibleDescription('Bugünkü hedef tamamlandı')
    rerender(<LobbyDailyPlan plan={plan} loading onStart={onStart} />)
    expect(trigger).toHaveAccessibleDescription('Planın hazırlanıyor…')
    rerender(<LobbyDailyPlan plan={plan} loading={false} unavailableReason="unavailable" onStart={onStart} />)
    expect(trigger).toHaveAccessibleDescription('Plan durumunu gör')
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('opens only on request and restores focus and scroll after closing, including StrictMode', () => {
    const onStart = vi.fn(() => true)
    render(<StrictMode><LobbyDailyPlan plan={plan} loading={false} onStart={onStart} /></StrictMode>)
    const trigger = screen.getByRole('button', { name: 'Günlük planın' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Kaldığın yerden devam et')).not.toBeInTheDocument()
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Sana özel günlük plan' })).toHaveAttribute('data-size', 'compact')
    expect(screen.getByRole('button', { name: 'Devam Et · 1 Soru' })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(onStart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Pencereyi kapat' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('supports Escape cancellation and backdrop dismissal', () => {
    render(<LobbyDailyPlan plan={plan} loading={false} onStart={() => true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Günlük planın' }))
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Günlük planın' }))
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('preserves blocked starts and dismisses when the engine accepts the action', () => {
    const onStart = vi.fn(() => false)
    render(<LobbyDailyPlan plan={plan} loading={false} onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: 'Günlük planın' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devam Et · 1 Soru' }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    onStart.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Devam Et · 1 Soru' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('handles loading, empty and unavailable plans without an unusable start button', () => {
    const onStart = vi.fn(() => true)
    const { rerender } = render(<LobbyDailyPlan plan={null} loading onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: 'Günlük planın' }))
    expect(screen.getByRole('status')).toHaveTextContent('hazırlanıyor')
    rerender(<LobbyDailyPlan plan={null} loading={false} onStart={onStart} />)
    expect(screen.getByRole('status')).toHaveTextContent('şu anda hazır değil')
    rerender(<LobbyDailyPlan plan={plan} loading={false} unavailableReason="daily_plan_content_unavailable" onStart={onStart} />)
    expect(screen.getByRole('status')).toHaveTextContent('Planındaki bir soru şu anda kullanılamıyor')
    expect(screen.queryByRole('button', { name: /Soru/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ders Çalış ekranına git/ })).toHaveAttribute('href', '/arena/calisma')
    expect(onStart).not.toHaveBeenCalled()
  })
})
