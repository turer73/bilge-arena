/**
 * Bilge Arena Oda: RevealCountdown timer behavior tests
 * Sprint 2A Task 1
 *
 * Server-canonical timer (revealedAt + autoAdvanceSeconds * 1000) doğrulamasi.
 * useFakeTimers ile saniye saniye azalma + 0'da "Geçiliyor..." + 0=null render
 * + cleanup interval.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { RevealCountdown } from '../RevealCountdown'

describe('RevealCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('1) autoAdvanceSeconds=0 -> hic render edilmez (manuel mode)', () => {
    vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))
    render(
      <RevealCountdown
        revealedAt="2026-05-01T00:00:00Z"
        autoAdvanceSeconds={0}
      />,
    )
    expect(screen.queryByTestId('reveal-countdown')).not.toBeInTheDocument()
  })

  test('2) autoAdvanceSeconds=5, revealedAt=now -> "5 saniye sonra" goster', () => {
    const reveal = new Date('2026-05-01T00:00:00Z')
    vi.setSystemTime(reveal)
    render(
      <RevealCountdown
        revealedAt={reveal.toISOString()}
        autoAdvanceSeconds={5}
      />,
    )
    expect(screen.getByTestId('reveal-countdown')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/saniye sonra sonraki tur/i)).toBeInTheDocument()
  })

  test('3) 5 saniye gectiginde "Geçiliyor…" goster', () => {
    const reveal = new Date('2026-05-01T00:00:00Z')
    vi.setSystemTime(reveal)
    render(
      <RevealCountdown
        revealedAt={reveal.toISOString()}
        autoAdvanceSeconds={5}
      />,
    )

    // 5sn ileri (250ms tick'lerle 20 tick)
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getByText(/Geçiliyor/i)).toBeInTheDocument()
  })

  test('4) revealedAt 3sn once + autoAdvanceSeconds=5 -> remaining=2', () => {
    const reveal = new Date('2026-05-01T00:00:00Z')
    vi.setSystemTime(new Date(reveal.getTime() + 3000))
    render(
      <RevealCountdown
        revealedAt={reveal.toISOString()}
        autoAdvanceSeconds={5}
      />,
    )
    // 5 - 3 = 2 saniye kaldi
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
