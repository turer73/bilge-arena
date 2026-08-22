import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGameAutoPause } from '../use-game-auto-pause'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useGameAutoPause', () => {
  it('etkilesim olmazsa oyun oturumunu duraklatir ve acikca devam ettirir', () => {
    vi.useFakeTimers()
    const onPause = vi.fn()
    const { result } = renderHook(() => useGameAutoPause({
      active: true,
      sessionKey: 'session-1',
      onPause,
      timeoutMs: 1_000,
    }))

    act(() => { vi.advanceTimersByTime(1_000) })
    expect(onPause).toHaveBeenCalledTimes(1)
    expect(result.current.autoPaused).toBe(true)

    act(() => result.current.resume())
    expect(result.current.autoPaused).toBe(false)
  })

  it('sekme gizlenince beklemeden duraklatir', () => {
    const onPause = vi.fn()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const { result } = renderHook(() => useGameAutoPause({
      active: true,
      sessionKey: 'session-2',
      onPause,
    }))

    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(hidden).toHaveBeenCalled()
    expect(onPause).toHaveBeenCalledTimes(1)
    expect(result.current.autoPaused).toBe(true)
  })

  it('deneme gibi active olmayan akista zamanlayici kurmaz', () => {
    vi.useFakeTimers()
    const onPause = vi.fn()
    const { result } = renderHook(() => useGameAutoPause({
      active: false,
      sessionKey: 'exam-1',
      onPause,
      timeoutMs: 1_000,
    }))

    act(() => { vi.advanceTimersByTime(2_000) })
    expect(onPause).not.toHaveBeenCalled()
    expect(result.current.autoPaused).toBe(false)
  })
})
