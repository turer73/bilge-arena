import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  test('1) devam eden oda olmadığını ve üç üst seçeneği açıklar', () => {
    render(<EmptyState />)
    expect(screen.getByText(/Henüz devam eden odan yok/)).toBeInTheDocument()
    expect(screen.getByText(/hızlı antrenman başlatabilir/i)).toBeInTheDocument()
  })

  test('2) üst karar alanını tekrar eden CTA içermez', () => {
    render(<EmptyState />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
