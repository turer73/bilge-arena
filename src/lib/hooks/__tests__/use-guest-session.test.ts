import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGuestSession, computePromptLevel, resetGuestQuizCount } from '../use-guest-session'

const STORAGE_KEY = 'guest_quiz_count'

describe('computePromptLevel', () => {
  it('0 veya 1 quiz -> Level 1', () => {
    expect(computePromptLevel(0)).toBe(1)
    expect(computePromptLevel(1)).toBe(1)
  })

  it('2 quiz -> Level 2', () => {
    expect(computePromptLevel(2)).toBe(2)
  })

  it('3 ve uzeri -> Level 3 (hard wall)', () => {
    expect(computePromptLevel(3)).toBe(3)
    expect(computePromptLevel(5)).toBe(3)
    expect(computePromptLevel(100)).toBe(3)
  })
})

describe('useGuestSession', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('baslangicta quizCount 0', () => {
    const { result } = renderHook(() => useGuestSession())
    expect(result.current.quizCount).toBe(0)
  })

  it('localStorage\'dan mevcut degeri okur', () => {
    localStorage.setItem(STORAGE_KEY, '3')
    const { result } = renderHook(() => useGuestSession())
    expect(result.current.quizCount).toBe(3)
  })

  it('bozuk localStorage degerinde 0 dondurur', () => {
    localStorage.setItem(STORAGE_KEY, 'abc')
    const { result } = renderHook(() => useGuestSession())
    expect(result.current.quizCount).toBe(0)
  })

  it('incrementQuizCount sayaci arttirir ve yeni degeri dondurur', () => {
    const { result } = renderHook(() => useGuestSession())
    let next: number = 0
    act(() => {
      next = result.current.incrementQuizCount()
    })
    expect(next).toBe(1)
    expect(result.current.quizCount).toBe(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1')
  })

  it('ust uste increment calisir', () => {
    const { result } = renderHook(() => useGuestSession())
    act(() => {
      result.current.incrementQuizCount()
    })
    act(() => {
      result.current.incrementQuizCount()
    })
    act(() => {
      result.current.incrementQuizCount()
    })
    expect(result.current.quizCount).toBe(3)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('3')
  })

  it('resetQuizCount sayaci sifirlar', () => {
    localStorage.setItem(STORAGE_KEY, '5')
    const { result } = renderHook(() => useGuestSession())
    act(() => {
      result.current.resetQuizCount()
    })
    expect(result.current.quizCount).toBe(0)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  // Regression (2026-04-18): incrementQuizCount icindeki setState, callback'i
  // yeniden olusturursa tuketen useEffect cleanup ile setTimeout'u oldurur ve
  // prompt modal hic acilmaz. Callback identity stable olmali.
  it('incrementQuizCount identity state degisse bile stabil kalir', () => {
    const { result, rerender } = renderHook(() => useGuestSession())
    const firstRef = result.current.incrementQuizCount
    act(() => {
      firstRef()
    })
    rerender()
    expect(result.current.quizCount).toBe(1)
    expect(result.current.incrementQuizCount).toBe(firstRef)
  })

  it('resetQuizCount identity de stable', () => {
    const { result, rerender } = renderHook(() => useGuestSession())
    const firstRef = result.current.resetQuizCount
    act(() => {
      result.current.incrementQuizCount()
    })
    rerender()
    expect(result.current.resetQuizCount).toBe(firstRef)
  })
})

describe('resetGuestQuizCount (module helper)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('localStorage key\'ini siler', () => {
    localStorage.setItem(STORAGE_KEY, '7')
    resetGuestQuizCount()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('key zaten yoksa hata firlatmaz', () => {
    expect(() => resetGuestQuizCount()).not.toThrow()
  })
})
