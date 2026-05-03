import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  test('1) "Henuz aktif odan yok" copy render', () => {
    render(<EmptyState />)
    expect(screen.getByText(/Henuz aktif odan yok/)).toBeInTheDocument()
  })

  test('2) Yeni Oda link + Kod ile Katil link aktif', () => {
    render(<EmptyState />)
    const newLink = screen.getByText(/Yeni Oda Kur/) as HTMLAnchorElement
    expect(newLink.getAttribute('href')).toBe('/oda/yeni')
    // 2026-05-03 fix: Kod ile Katil artik disabled buton degil, /oda/kod link
    const kodLink = screen.getByText(/Kod ile Katil/).closest('a') as HTMLAnchorElement
    expect(kodLink).toBeInTheDocument()
    expect(kodLink.getAttribute('href')).toBe('/oda/kod')
  })
})
