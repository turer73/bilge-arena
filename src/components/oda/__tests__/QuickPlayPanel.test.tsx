/**
 * Bilge Arena Oda: QuickPlayPanel component tests
 * Sprint 2B Task 4 (Solo mode skeleton)
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock('@/lib/rooms/actions', () => ({
  quickPlayRoomAction: vi.fn(),
}))

import { QuickPlayPanel } from '../QuickPlayPanel'

const formAction = vi.fn()

describe('QuickPlayPanel', () => {
  test('1) render: kategori select + Hızlı Oyun button', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<QuickPlayPanel />)
    expect(screen.getByLabelText(/Hızlı oyun kategorisi/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Hızlı Oyun.*3 bot rakip/i }),
    ).toBeInTheDocument()
  })

  test('2) 10 kategori secenegi var', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<QuickPlayPanel />)
    const options = container.querySelectorAll(
      'select[name="category"] option',
    )
    expect(options).toHaveLength(10)
  })

  test('3) default kategori = genel-kultur', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<QuickPlayPanel />)
    const select = screen.getByLabelText(
      /Hızlı oyun kategorisi/i,
    ) as HTMLSelectElement
    expect(select.value).toBe('genel-kultur')
  })

  test('4) hidden inputs: difficulty=2, question_count=10', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<QuickPlayPanel />)
    const diff = container.querySelector(
      'input[name="difficulty"]',
    ) as HTMLInputElement
    const qc = container.querySelector(
      'input[name="question_count"]',
    ) as HTMLInputElement
    expect(diff.type).toBe('hidden')
    expect(diff.value).toBe('2')
    expect(qc.type).toBe('hidden')
    expect(qc.value).toBe('10')
  })

  test('5) isPending=true -> "Hazırlanıyor…" disabled button', () => {
    mockUseActionState.mockReturnValue([{}, formAction, true])
    render(<QuickPlayPanel />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn.textContent).toMatch(/Hazırlanıyor/i)
  })

  test('6) error state -> role=alert', () => {
    mockUseActionState.mockReturnValue([
      { error: 'Giris yapmalisin' },
      formAction,
      false,
    ])
    render(<QuickPlayPanel />)
    expect(screen.getByRole('alert')).toHaveTextContent('Giris yapmalisin')
  })

  test('7) data-testid="quick-play-panel" + bot emoji header', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<QuickPlayPanel />)
    expect(screen.getByTestId('quick-play-panel')).toBeInTheDocument()
    expect(screen.getByText(/🤖 Hızlı Oyun/i)).toBeInTheDocument()
  })
})
