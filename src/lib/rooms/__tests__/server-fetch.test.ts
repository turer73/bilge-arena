/**
 * Bilge Arena Oda Sistemi: server-fetch helpers unit tests
 * Sprint 1 PR4a Task 2
 *
 * 10 senaryo:
 *   fetchMyRooms (7): authorized 2 rows, RLS empty, network reject,
 *     URL params, Bearer header, cache no-store, malformed JSON
 *   fetchRoomByCode (3): found, not found, special-char encoding
 *
 * Mock: globalThis.fetch (vi.fn()), per-test reset.
 */

import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest'
import {
  fetchMyRooms,
  fetchRoomByCode,
  fetchLobbyPreviewQuestion,
} from '../server-fetch'

const ORIGINAL_FETCH = globalThis.fetch
const mockFetch = vi.fn()

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
})

afterAll(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

const ok = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  })

describe('fetchMyRooms', () => {
  test('1) authorized + 2 rows → array of 2', async () => {
    mockFetch.mockReturnValue(
      ok([
        {
          id: 'a',
          code: 'BIL2A',
          title: 'A',
          state: 'lobby',
          created_at: '2026-04-29',
          room_members: [{ count: 3 }],
        },
        {
          id: 'b',
          code: 'BIL2B',
          title: 'B',
          state: 'in_progress',
          created_at: '2026-04-29',
          room_members: [{ count: 6 }],
        },
      ]),
    )
    const rooms = await fetchMyRooms('jwt')
    expect(rooms).toHaveLength(2)
    expect(rooms[0].code).toBe('BIL2A')
  })

  test('2) RLS empty → []', async () => {
    mockFetch.mockReturnValue(ok([]))
    expect(await fetchMyRooms('jwt')).toEqual([])
  })

  test('3) network reject → []', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await fetchMyRooms('jwt')).toEqual([])
  })

  test('4) URL params: state in lobby/in_progress + order desc', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchMyRooms('jwt')
    const url = String(mockFetch.mock.calls[0][0])
    // URLSearchParams encode'lar comma'yi %2C, parantezi de encode edebilir
    expect(url).toMatch(/state=in\.(\(|%28)lobby(%2C|,)in_progress(\)|%29)/)
    expect(url).toMatch(/order=created_at\.desc/)
  })

  test('5) Authorization Bearer header set', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchMyRooms('my-jwt')
    const init = mockFetch.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-jwt')
  })

  test('6) cache: no-store set', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchMyRooms('jwt')
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(init.cache).toBe('no-store')
  })

  test('7) malformed JSON → []', async () => {
    mockFetch.mockReturnValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('parse error')),
    })
    expect(await fetchMyRooms('jwt')).toEqual([])
  })
})

describe('fetchRoomByCode', () => {
  test('8) found → first row', async () => {
    mockFetch.mockReturnValue(ok([{ id: 'a', code: 'BIL2A' }]))
    const r = await fetchRoomByCode('jwt', 'BIL2A')
    expect(r?.code).toBe('BIL2A')
  })

  test('9) not found / RLS → null', async () => {
    mockFetch.mockReturnValue(ok([]))
    expect(await fetchRoomByCode('jwt', 'NONE')).toBeNull()
  })

  test('10) special-char code "BIL/GE" → URL encoded once', async () => {
    mockFetch.mockReturnValue(ok([]))
    await fetchRoomByCode('jwt', 'BIL/GE')
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toMatch(/code=eq\.BIL%2FGE/)
  })
})

describe('fetchLobbyPreviewQuestion (Sprint 2A Task 2)', () => {
  test('11) ok JSONB {question, options} → tip-safe object', async () => {
    mockFetch.mockReturnValue(
      ok({ question: 'Türkiye başkenti?', options: ['Ankara', 'İstanbul'] }),
    )
    const r = await fetchLobbyPreviewQuestion('jwt', 'cografya')
    expect(r).toEqual({
      question: 'Türkiye başkenti?',
      options: ['Ankara', 'İstanbul'],
    })
  })

  test('12) Anti-cheat: response answer alani client tarafa gelmez (sift)', async () => {
    // RPC zaten answer dondurmez, yine de defense-in-depth: server-fetch
    // typecheck question + options istisnasi geri donderir, answer akmaz
    mockFetch.mockReturnValue(
      ok({
        question: 'Soru?',
        options: ['a', 'b'],
        // Hipotetik: server-side bug answer ekledi; cli sift atmali
        answer: 'a',
      }),
    )
    const r = await fetchLobbyPreviewQuestion('jwt', 'tarih')
    expect(r).not.toHaveProperty('answer')
    expect(r).toEqual({ question: 'Soru?', options: ['a', 'b'] })
  })

  test('13) RPC NULL doner (kategori bos) → null', async () => {
    mockFetch.mockReturnValue(ok(null))
    expect(await fetchLobbyPreviewQuestion('jwt', 'xx')).toBeNull()
  })

  test('14) malformed response (options array degil) → null', async () => {
    mockFetch.mockReturnValue(ok({ question: 'X', options: 'not-array' }))
    expect(await fetchLobbyPreviewQuestion('jwt', 'cat')).toBeNull()
  })

  test('15) network reject → null sessiz', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await fetchLobbyPreviewQuestion('jwt', 'cat')).toBeNull()
  })

  test('16) POST + Bearer JWT + Content-Type JSON', async () => {
    mockFetch.mockReturnValue(ok({ question: 'X', options: [] }))
    await fetchLobbyPreviewQuestion('jwt-token', 'matematik')
    const callArgs = mockFetch.mock.calls[0]
    const url = String(callArgs[0])
    const opts = callArgs[1] as RequestInit
    expect(url).toMatch(/\/rpc\/get_lobby_preview_question$/)
    expect(opts.method).toBe('POST')
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      'Bearer jwt-token',
    )
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
    expect(opts.body).toBe(JSON.stringify({ p_category: 'matematik' }))
  })
})
