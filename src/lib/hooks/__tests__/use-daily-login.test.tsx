/**
 * Bilge Arena: useDailyLogin — günlük giriş ödülü akışı.
 * Misafirde çağrı yok, claimed→toast+profil-yenileme, already_claimed sessiz,
 * streak_reset ek bilgisi, milestone kutlaması, tek-sefer guard.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const authState = vi.hoisted(() => ({ value: { user: null as { id: string } | null } }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))

const mocks = vi.hoisted(() => ({
  refreshProfile: vi.fn(() => Promise.resolve()),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  playSound: vi.fn(),
}))
vi.mock('@/lib/hooks/use-auth', () => ({ refreshProfile: mocks.refreshProfile }))
vi.mock('@/stores/toast-store', () => ({
  toast: { success: mocks.toastSuccess, info: mocks.toastInfo },
}))
vi.mock('@/lib/utils/sounds', () => ({ playSound: mocks.playSound }))

import { useDailyLogin } from '../use-daily-login'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function apiResponse(data: Record<string, unknown>) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.value = { user: { id: 'u1' } }
  fetchMock.mockReturnValue(apiResponse({ status: 'claimed', xpAwarded: 20, streak: 2 }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDailyLogin', () => {
  test('misafir: API hiç çağrılmaz', () => {
    authState.value = { user: null }
    renderHook(() => useDailyLogin())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('claimed: POST /api/daily-login + profil yenile + xp sesi + toast', async () => {
    renderHook(() => useDailyLogin())
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/daily-login', { method: 'POST' })
    expect(mocks.refreshProfile).toHaveBeenCalledOnce()
    expect(mocks.playSound).toHaveBeenCalledWith('xp')
    expect(mocks.toastSuccess.mock.calls[0][0]).toContain('+20 XP')
  })

  test('already_claimed: hiçbir toast gösterilmez', async () => {
    fetchMock.mockReturnValue(apiResponse({ status: 'already_claimed' }))
    renderHook(() => useDailyLogin())
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(() => Promise.resolve())
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.refreshProfile).not.toHaveBeenCalled()
  })

  test('streak_reset: ödül toast + seri-sıfırlandı bilgisi', async () => {
    fetchMock.mockReturnValue(apiResponse({ status: 'streak_reset', xpAwarded: 10, streak: 1 }))
    renderHook(() => useDailyLogin())
    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalled())
    expect(mocks.toastInfo.mock.calls[0][0]).toContain('Seri sıfırlandı')
  })

  test('milestone (streak=10): 1.5sn sonra ikinci kutlama + level_up sesi', async () => {
    fetchMock.mockReturnValue(apiResponse({ status: 'claimed', xpAwarded: 70, streak: 10 }))
    renderHook(() => useDailyLogin())
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1))

    vi.useFakeTimers()
    // İlk toast sonrası kurulmuş setTimeout'u tetikle — gerçek zamanlayıcıyla
    // kurulduğu için burada gerçek bekleme yerine kalan süreyi bekliyoruz
    vi.useRealTimers()
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(2), { timeout: 2500 })
    expect(mocks.playSound).toHaveBeenCalledWith('level_up')
    expect(mocks.toastSuccess.mock.calls[1][1]).toContain('10 gun seri')
  })

  test('tek-sefer guard: rerender ikinci fetch tetiklemez', async () => {
    const { rerender } = renderHook(() => useDailyLogin())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    rerender()
    rerender()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('fetch hatası: sessiz, toast yok', async () => {
    fetchMock.mockRejectedValue(new Error('ağ'))
    renderHook(() => useDailyLogin())
    await act(() => Promise.resolve())
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })
})
