import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BadgeShowcase } from '../badge-showcase'

describe('BadgeShowcase', () => {
  test('ilk açılışta kompakt rozet özetini gösterir', () => {
    const { container } = render(<BadgeShowcase earnedBadgeCodes={['first_game']} />)

    expect(screen.getByRole('heading', { name: 'Rozet Kasası' })).toBeInTheDocument()
    expect(container.querySelectorAll('[aria-label="Rozet özeti"] > div').length).toBeLessThanOrEqual(4)
    expect(screen.getByRole('button', { name: 'Tüm rozetleri gör' })).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('#all-profile-badges')).not.toBeInTheDocument()
  })

  test('kullanıcı isterse tüm rozet kategorilerini açar ve daraltır', () => {
    const { container } = render(<BadgeShowcase earnedBadgeCodes={[]} />)
    const toggle = screen.getByRole('button', { name: 'Tüm rozetleri gör' })

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Rozetleri daralt' })).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('#all-profile-badges')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rozetleri daralt' }))
    expect(container.querySelector('#all-profile-badges')).not.toBeInTheDocument()
  })
})
