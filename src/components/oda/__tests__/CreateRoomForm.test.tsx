/**
 * Bilge Arena Oda: CreateRoomForm component tests
 * Sprint 1 PR4a Task 4
 *
 * useActionState mock ile state-driven UI dogrulama:
 *   1) initial: 8 input alani gorunur (Sprint 2A: auto_advance_seconds eklenmis)
 *   2) fieldErrors -> per-field role=alert
 *   3) error -> top banner role=alert
 *   4) defaults: difficulty=2, max_players=8, mode=sync, auto_advance_seconds=5
 *   5) isPending=true -> button disabled + label
 *   6) Field name attribute eslesmesi
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// vi.hoisted ile spy ref (React 19 useActionState mock)
const { mockUseActionState } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: mockUseActionState,
  }
})

// actions.ts'i mock et — Server Action import'u client test'te crash etmesin
vi.mock('@/lib/rooms/actions', () => ({
  createRoomAction: vi.fn(),
}))

import { CreateRoomForm } from '../CreateRoomForm'

const formAction = vi.fn()

describe('CreateRoomForm', () => {
  test('1) initial: 8 input alani gorunur (Sprint 2A: auto_advance_seconds eklenmis)', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<CreateRoomForm />)
    expect(screen.getByLabelText(/Oda Adı/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Kategori/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Zorluk/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Soru Sayısı/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Maksimum Oyuncu/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Soru Süresi/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Otomatik Geçiş Süresi/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Mod/)).toBeInTheDocument()
  })

  test('2) fieldErrors prop -> title alti role=alert', () => {
    mockUseActionState.mockReturnValue([
      { fieldErrors: { title: ['Cok kisa'] } },
      formAction,
      false,
    ])
    render(<CreateRoomForm />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((a) => a.textContent === 'Cok kisa')).toBe(true)
  })

  test('3) error prop -> top banner role=alert', () => {
    mockUseActionState.mockReturnValue([
      { error: 'Yetkisiz' },
      formAction,
      false,
    ])
    render(<CreateRoomForm />)
    expect(screen.getByRole('alert')).toHaveTextContent('Yetkisiz')
  })

  test('4) Defaults: difficulty=2, max_players=8, mode=sync, auto_advance_seconds=5', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<CreateRoomForm />)
    expect(
      (screen.getByLabelText(/Zorluk/) as HTMLInputElement).defaultValue,
    ).toBe('2')
    expect(
      (screen.getByLabelText(/Maksimum Oyuncu/) as HTMLInputElement)
        .defaultValue,
    ).toBe('8')
    expect((screen.getByLabelText(/Mod/) as HTMLSelectElement).value).toBe(
      'sync',
    )
    // Sprint 2A Task 1
    expect(
      (screen.getByLabelText(/Otomatik Geçiş Süresi/) as HTMLInputElement)
        .defaultValue,
    ).toBe('5')
  })

  test('5) isPending=true -> button disabled + Olusturuluyor label', () => {
    mockUseActionState.mockReturnValue([{}, formAction, true])
    render(<CreateRoomForm />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    // Turkce diakritik (TDK feedback memory: UI metni Turkce)
    expect(btn.textContent).toMatch(/Oluşturuluyor/)
  })

  test('6) Field name attribute set', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<CreateRoomForm />)
    const names = [
      'title',
      'category',
      'difficulty',
      'question_count',
      'max_players',
      'per_question_seconds',
      'auto_advance_seconds',
      'is_public',
      'mode',
    ]
    for (const n of names) {
      expect(container.querySelector(`[name="${n}"]`)).not.toBeNull()
    }
  })

  test('7) Sprint 2A Task 3: is_public checkbox unchecked default', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<CreateRoomForm />)
    const checkbox = container.querySelector(
      'input[name="is_public"]',
    ) as HTMLInputElement
    expect(checkbox).not.toBeNull()
    expect(checkbox.type).toBe('checkbox')
    expect(checkbox.checked).toBe(false)
  })

  test('8) Sprint 2A Task 3: "Herkese Açık" label + uyari mesaji', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<CreateRoomForm />)
    expect(screen.getByText(/Herkese Açık/i)).toBeInTheDocument()
    expect(screen.getByText(/max 6 oyuncu/i)).toBeInTheDocument()
  })
})
