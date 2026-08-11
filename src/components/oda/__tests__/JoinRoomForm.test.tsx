import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  joinRoomAction: vi.fn(),
}))

import { JoinRoomForm } from '../JoinRoomForm'

const formAction = vi.fn()

describe('JoinRoomForm', () => {
  test('6 karakterli kodu mobil dostu tek kullanımlık kod alanında ister', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<JoinRoomForm />)

    const input = screen.getByLabelText('Oda Kodu') as HTMLInputElement
    expect(input.maxLength).toBe(6)
    expect(input.minLength).toBe(6)
    expect(input.autocomplete).toBe('one-time-code')
    expect(input.getAttribute('autocapitalize')).toBe('characters')
  })

  test('bekleme ve hata durumlarını erişilebilir biçimde gösterir', () => {
    mockUseActionState.mockReturnValue([
      { error: 'Oda bulunamadı' },
      formAction,
      true,
    ])
    render(<JoinRoomForm />)

    expect(screen.getByRole('button', { name: /Katılıyor/i })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Oda bulunamadı')
  })
})
