import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CTASection } from '../cta-section'
import { GamesSection } from '../games-section'

describe('Landing navigation controls', () => {
  it('renders call-to-action links without nested buttons', () => {
    const { container } = render(<CTASection />)

    expect(screen.getByRole('link', { name: /şimdi başla/i })).toHaveClass('btn-primary')
    expect(screen.getByRole('link', { name: /arkadaşlarınla oda kur/i })).toHaveClass('btn-ghost')
    expect(container.querySelector('a button')).toBeNull()
  })

  it('keeps each game card as one interactive target', () => {
    const { container } = render(<GamesSection />)

    expect(screen.getAllByRole('link')).toHaveLength(5)
    expect(container.querySelector('a button')).toBeNull()
    expect(container.querySelectorAll('a .btn-primary')).toHaveLength(5)
  })
})
