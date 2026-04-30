import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from '../Field'

describe('Field', () => {
  test('1) label htmlFor matches input id', () => {
    render(<Field label="Baslik" name="title" />)
    const input = screen.getByLabelText('Baslik') as HTMLInputElement
    const label = screen.getByText('Baslik')
    expect(label.getAttribute('for')).toBe(input.id)
  })

  test('2) error prop -> role=alert', () => {
    render(<Field label="X" name="x" error="Cok kisa" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Cok kisa')
  })

  test('3) error yoksa alert render olmaz', () => {
    render(<Field label="X" name="x" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
