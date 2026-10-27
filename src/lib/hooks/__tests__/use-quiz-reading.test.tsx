import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QUIZ_FONT_STORAGE_KEY, setQuizFontSize, useQuizReading } from '../use-quiz-reading'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.removeItem(QUIZ_FONT_STORAGE_KEY)
  act(() => setQuizFontSize('normal'))
  window.localStorage.removeItem(QUIZ_FONT_STORAGE_KEY)
})

describe('useQuizReading', () => {
  test('varsayılan normal, seçim ölçeği ve saklanan değeri günceller', () => {
    const { result } = renderHook(() => useQuizReading())
    expect(result.current.fontSize).toBe('normal')
    expect(result.current.fontScale).toBe(1)
    act(() => result.current.setFontSize('small'))
    expect(result.current.fontScale).toBe(0.88)
    expect(window.localStorage.getItem(QUIZ_FONT_STORAGE_KEY)).toBe('small')
  })

  test('geçersiz saklı değer normale döner', () => {
    window.localStorage.setItem(QUIZ_FONT_STORAGE_KEY, 'dev')
    const { result } = renderHook(() => useQuizReading())
    expect(result.current.fontSize).toBe('normal')
  })

  test('depolama kullanılamazsa seçim oturum boyunca korunur', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useQuizReading())
    act(() => result.current.setFontSize('large'))
    expect(result.current.fontSize).toBe('large')
    expect(result.current.fontScale).toBe(1.12)
  })
})
