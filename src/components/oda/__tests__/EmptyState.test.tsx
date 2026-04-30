import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  test('1) "Henuz aktif odan yok" copy render', () => {
    render(<EmptyState />)
    expect(screen.getByText(/Henuz aktif odan yok/)).toBeInTheDocument()
  })

  test('2) Yeni Oda link href + Kod disabled', () => {
    render(<EmptyState />)
    const newLink = screen.getByText(/Yeni Oda Kur/) as HTMLAnchorElement
    expect(newLink.getAttribute('href')).toBe('/oda/yeni')
    const kodBtn = screen.getByText(/Kod ile Katil/).closest('button')
    expect(kodBtn).toBeDisabled()
  })
})
