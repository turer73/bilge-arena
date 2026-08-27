import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArenaModeCards } from '../ArenaModeCards'

describe('ArenaModeCards', () => {
  it('Kule ve Bil ve Fethet modlarını Arena merkezinde görünür yapar', () => {
    render(<ArenaModeCards />)

    expect(screen.getByRole('link', { name: /Kule Modu/ })).toHaveAttribute('href', '/arena/kule')
    expect(screen.getByRole('link', { name: /Bil ve Fethet/ })).toHaveAttribute('href', '/arena/fethet')
  })
})
