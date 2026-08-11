import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FrameDot } from '../profile-frame-ring'
import { PROFILE_FRAMES } from '@/lib/constants/profile-frames'

describe('FrameDot', () => {
  test('görsel küçük olsa da seçim hedefi en az 44x44 sınıfı taşır', () => {
    render(
      <FrameDot
        frame={PROFILE_FRAMES[1]}
        active={false}
        onClick={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: PROFILE_FRAMES[1].name })
    expect(button.className).toContain('h-11')
    expect(button.className).toContain('w-11')
  })
})
