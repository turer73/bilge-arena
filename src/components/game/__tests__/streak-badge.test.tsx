import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StreakBadge } from '../streak-badge'

describe('StreakBadge', () => {
  it('streak sayisini gosterir', () => {
    render(<StreakBadge streak={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('streak 0 iken soluk gosterir', () => {
    const { container } = render(<StreakBadge streak={0} />)
    const badge = container.firstChild as HTMLElement
    expect(badge.style.opacity).toBe('0.4')
  })

  it('streak < 5 iken SERI! gostermez', () => {
    render(<StreakBadge streak={4} />)
    expect(screen.queryByText('SERI!')).not.toBeInTheDocument()
    expect(screen.queryByText('YANGIN!')).not.toBeInTheDocument()
  })

  it('streak >= 5 iken SERI! gosterir', () => {
    render(<StreakBadge streak={5} />)
    expect(screen.getByText('SERI!')).toBeInTheDocument()
  })

  it('streak >= 10 iken YANGIN! gosterir', () => {
    render(<StreakBadge streak={10} />)
    expect(screen.getByText('YANGIN!')).toBeInTheDocument()
    expect(screen.queryByText('SERI!')).not.toBeInTheDocument()
  })

  it('ates emojisi her zaman gorunur', () => {
    render(<StreakBadge streak={1} />)
    expect(screen.getByText('🔥')).toBeInTheDocument()
  })
})
