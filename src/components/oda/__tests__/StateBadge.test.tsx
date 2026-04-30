import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StateBadge } from '../StateBadge'

/**
 * 5 DB state mapping (chk_rooms_state CHECK constraint).
 * PR4b-5: state isimleri DB ile uyumlu hale getirildi.
 */
describe('StateBadge', () => {
  test('1) lobby -> Bekliyor', () => {
    render(<StateBadge state="lobby" />)
    expect(screen.getByText('Bekliyor')).toBeInTheDocument()
  })

  test('2) active -> Oyunda', () => {
    render(<StateBadge state="active" />)
    expect(screen.getByText('Oyunda')).toBeInTheDocument()
  })

  test('3) reveal -> Sonuc', () => {
    render(<StateBadge state="reveal" />)
    expect(screen.getByText('Sonuc')).toBeInTheDocument()
  })

  test('4) completed -> Bitti', () => {
    render(<StateBadge state="completed" />)
    expect(screen.getByText('Bitti')).toBeInTheDocument()
  })

  test('5) archived -> Arsivlenmis', () => {
    render(<StateBadge state="archived" />)
    expect(screen.getByText('Arsivlenmis')).toBeInTheDocument()
  })
})
