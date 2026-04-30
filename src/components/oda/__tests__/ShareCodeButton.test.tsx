/**
 * Bilge Arena Oda: ShareCodeButton component test
 * Sprint 1 PR4b Task 6
 *
 * 1 senaryo:
 *   23) click -> navigator.clipboard.writeText(code) cagrilir
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShareCodeButton } from '../ShareCodeButton'

describe('ShareCodeButton', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  test('23) click -> clipboard.writeText(code)', async () => {
    render(<ShareCodeButton code="BLZGE2" />)
    const btn = screen.getByRole('button', { name: /BLZGE2/ })
    btn.click()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('BLZGE2')
  })
})
