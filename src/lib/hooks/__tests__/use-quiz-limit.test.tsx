/**
 * Bilge Arena: useQuizLimit — günlük quiz limiti enforce mantığı.
 * Feature kapalı/açık, premium sınırsız, misafir, limit-doldu,
 * fetch-hatası sessiz degrade ve refresh davranışı.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const authState = vi.hoisted(() => ({
  value: { user: null as { id: string } | null, profile: null as { is_premium?: boolean } | null },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))

const featureState = vi.hoisted(() => ({ QUIZ_LIMIT: false }))
vi.mock('@/lib/constants/premium', () => ({
  FEATURES: featureState,
  FREE_DAILY_LIMIT: 5,
}))

import { useQuizLimit } from '../use-quiz-limit'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function apiResponse(data: Record<string, unknown>) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
}

beforeEach(() => {
  fetchMock.mockReset()
  authState.value = { user: null, profile: null }
  featureState.QUIZ_LIMIT = false
})

describe('useQuizLimit', () => {
  test('feature kapalı: her zaman oynanabilir, API hiç çağrılmaz', () => {
    const { result } = renderHook(() => useQuizLimit())
    expect(result.current.canPlay).toBe(true)
    expect(result.current.remaining).toBe(-1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('feature açık + limit dolu (free user): canPlay=false, remaining=0', async () => {
    featureState.QUIZ_LIMIT = true
    authState.value = { user: { id: 'u1' }, profile: { is_premium: false } }
    fetchMock.mockReturnValue(apiResponse({ limit: 5, used: 5, isPremium: false, isGuest: false }))

    const { result } = renderHook(() => useQuizLimit())
    await waitFor(() => expect(result.current.canPlay).toBe(false))
    expect(result.current.remaining).toBe(0)
    expect(result.current.used).toBe(5)
  })

  test('feature açık + hak kalmış: canPlay=true, remaining doğru', async () => {
    featureState.QUIZ_LIMIT = true
    authState.value = { user: { id: 'u1' }, profile: { is_premium: false } }
    fetchMock.mockReturnValue(apiResponse({ limit: 5, used: 3, isPremium: false, isGuest: false }))

    const { result } = renderHook(() => useQuizLimit())
    await waitFor(() => expect(result.current.remaining).toBe(2))
    expect(result.current.canPlay).toBe(true)
  })

  test('premium: limit dolu olsa da sınırsız (remaining=-1)', async () => {
    featureState.QUIZ_LIMIT = true
    authState.value = { user: { id: 'u1' }, profile: { is_premium: true } }
    fetchMock.mockReturnValue(apiResponse({ limit: 5, used: 99, isPremium: true, isGuest: false }))

    const { result } = renderHook(() => useQuizLimit())
    await waitFor(() => expect(result.current.isPremium).toBe(true))
    expect(result.current.remaining).toBe(-1)
    expect(result.current.canPlay).toBe(true)
  })

  test('misafir: canPlay=true (misafir akışı ayrı yönetilir)', async () => {
    featureState.QUIZ_LIMIT = true
    fetchMock.mockReturnValue(apiResponse({ limit: 5, used: 5, isPremium: false, isGuest: true }))

    const { result } = renderHook(() => useQuizLimit())
    await waitFor(() => expect(result.current.isGuest).toBe(true))
    expect(result.current.canPlay).toBe(true)
  })

  test('fetch hatası: sessiz degrade — varsayılanlarla oynanabilir kalır', async () => {
    featureState.QUIZ_LIMIT = true
    authState.value = { user: { id: 'u1' }, profile: null }
    fetchMock.mockRejectedValue(new Error('ağ yok'))

    const { result } = renderHook(() => useQuizLimit())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.canPlay).toBe(true)
    expect(result.current.limit).toBe(5) // FREE_DAILY_LIMIT fallback
  })

  test('refresh: API yeniden çağrılır ve veri güncellenir', async () => {
    featureState.QUIZ_LIMIT = true
    authState.value = { user: { id: 'u1' }, profile: { is_premium: false } }
    fetchMock.mockReturnValueOnce(apiResponse({ limit: 5, used: 1, isPremium: false, isGuest: false }))

    const { result } = renderHook(() => useQuizLimit())
    await waitFor(() => expect(result.current.used).toBe(1))

    fetchMock.mockReturnValueOnce(apiResponse({ limit: 5, used: 4, isPremium: false, isGuest: false }))
    await act(() => result.current.refresh())
    await waitFor(() => expect(result.current.used).toBe(4))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
