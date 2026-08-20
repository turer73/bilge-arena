import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Global setup bu modulu "yardimcilar acik" olarak mock'lar; hook'un kendi
// davranisini olcmek icin burada gercek uygulama kullanilir.
vi.unmock('@/lib/assistance-policy/client')

const { useAssistancePolicy, canUseHelper } = await import('../client')
import { CLOSED_ASSISTANCE_POLICY, OPEN_ASSISTANCE_POLICY } from '../contract'

afterEach(() => vi.unstubAllGlobals())

describe('useAssistancePolicy', () => {
  test('politika okunana kadar hiçbir yardımcı açılmaz', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
    const { result } = renderHook(() => useAssistancePolicy())
    expect(result.current.loading).toBe(true)
    expect(canUseHelper(result.current, 'board')).toBe(false)
    expect(canUseHelper(result.current, 'coach')).toBe(false)
    expect(canUseHelper(result.current, 'assistant')).toBe(false)
  })

  test('sınav modu açıkken üç yardımcı da kapanır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        examMode: true, board: false, coach: false, assistant: false,
        until: '2026-08-15T12:00:00+03:00',
      }),
    }))
    const { result } = renderHook(() => useAssistancePolicy())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.policy.examMode).toBe(true)
    expect(canUseHelper(result.current, 'board')).toBe(false)
    expect(canUseHelper(result.current, 'coach')).toBe(false)
    expect(canUseHelper(result.current, 'assistant')).toBe(false)
  })

  test('sınav modu yokken yardımcılar açılır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => OPEN_ASSISTANCE_POLICY,
    }))
    const { result } = renderHook(() => useAssistancePolicy())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(canUseHelper(result.current, 'board')).toBe(true)
    expect(canUseHelper(result.current, 'coach')).toBe(true)
  })

  test('istek başarısızsa fail-closed davranır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const { result } = renderHook(() => useAssistancePolicy())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.policy).toEqual(CLOSED_ASSISTANCE_POLICY)
    expect(canUseHelper(result.current, 'board')).toBe(false)
  })

  test('ağ hatasında da fail-closed davranır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { result } = renderHook(() => useAssistancePolicy())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(canUseHelper(result.current, 'coach')).toBe(false)
  })

  test('sözleşmeye uymayan yanıt fail-closed sayılır', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ examMode: false, board: 'evet' }),
    }))
    const { result } = renderHook(() => useAssistancePolicy())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(canUseHelper(result.current, 'assistant')).toBe(false)
  })
})
