import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StateBadge } from '../StateBadge'

describe('StateBadge', () => {
  test('1) lobby -> Bekliyor', () => {
    render(<StateBadge state="lobby" />)
    expect(screen.getByText('Bekliyor')).toBeInTheDocument()
  })

  test('2) in_progress -> Oyunda', () => {
    render(<StateBadge state="in_progress" />)
    expect(screen.getByText('Oyunda')).toBeInTheDocument()
  })

  test('3) finished -> Bitti', () => {
    render(<StateBadge state="finished" />)
    expect(screen.getByText('Bitti')).toBeInTheDocument()
  })

  test('4) cancelled -> Iptal', () => {
    render(<StateBadge state="cancelled" />)
    expect(screen.getByText('Iptal')).toBeInTheDocument()
  })
})
