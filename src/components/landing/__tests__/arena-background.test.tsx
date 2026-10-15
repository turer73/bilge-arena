import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArenaBackground } from '../arena-background'

describe('ArenaBackground', () => {
  it('keeps centering on a stationary wrapper while rings animate', () => {
    const { container } = render(<ArenaBackground />)
    const spinningRing = container.querySelector('.animate-spin-slow')
    expect(spinningRing).not.toBeNull()
    expect(spinningRing?.className).not.toContain('-translate-')
    expect(spinningRing?.parentElement?.className).toContain('-translate-x-1/2')

    const pulsingRings = [...container.querySelectorAll<HTMLElement>('[style*="pulse-ring"]')]
    expect(pulsingRings).toHaveLength(4)
    for (const ring of pulsingRings) {
      expect(ring.style.transform).toBe('')
      expect(ring.parentElement?.className).toContain('-translate-x-1/2')
    }
  })
})
