import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSoundEnabled: vi.fn(() => true),
  toggleSound: vi.fn(() => false),
  playSound: vi.fn(),
}))

vi.mock('@/lib/utils/sounds', () => mocks)

import { SoundToggle } from '../sound-toggle'

describe('SoundToggle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mobil dokunma hedefini en az 44x44 tutar', () => {
    render(<SoundToggle />)

    expect(screen.getByRole('button', { name: 'Sesi kapat' }))
      .toHaveClass('h-11', 'w-11')
  })

  it('ses durumunu tek dokunusla degistirir', () => {
    render(<SoundToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'Sesi kapat' }))

    expect(mocks.toggleSound).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Sesi aç' })).toBeVisible()
  })
})
