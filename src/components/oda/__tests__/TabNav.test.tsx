/**
 * Bilge Arena Oda: TabNav component tests
 * Sprint 2A Task 3
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TabNav } from '../TabNav'

describe('TabNav', () => {
  test('1) activeTab=mine -> Odalarim aria-current=page, public degil', () => {
    render(<TabNav activeTab="mine" />)
    const mine = screen.getByText('Odalarım')
    const publicLink = screen.getByText('Aktif Odalar')
    expect(mine.getAttribute('aria-current')).toBe('page')
    expect(publicLink.getAttribute('aria-current')).toBeNull()
  })

  test('2) activeTab=public -> Aktif Odalar aria-current=page', () => {
    render(<TabNav activeTab="public" />)
    const publicLink = screen.getByText('Aktif Odalar')
    const mine = screen.getByText('Odalarım')
    expect(publicLink.getAttribute('aria-current')).toBe('page')
    expect(mine.getAttribute('aria-current')).toBeNull()
  })

  test('3) Odalarim href /oda, Aktif Odalar href /oda?tab=public', () => {
    render(<TabNav activeTab="mine" />)
    expect(screen.getByText('Odalarım').getAttribute('href')).toBe('/oda')
    expect(screen.getByText('Aktif Odalar').getAttribute('href')).toBe(
      '/oda?tab=public',
    )
  })
})
