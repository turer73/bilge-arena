/**
 * Bilge Arena Oda Sistemi: client.ts callRpc unit tests
 * Sprint 1 PR3
 *
 * Mock fetch globally — vitest pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callRpc } from '../client'

describe('callRpc', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('rejects empty JWT with P0001', async () => {
    const result = await callRpc<{ id: string }>('', 'create_room', {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('P0001')
      expect(result.error.status).toBe(401)
    }
  })

  it('returns ok=true on 200 success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'abc', code: 'TESTAB' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const result = await callRpc<{ id: string; code: string }>('jwt-token', 'create_room', {
      p_title: 'Test',
      p_category: 'sayilar',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.id).toBe('abc')
      expect(result.data.code).toBe('TESTAB')
    }
  })

  it('forwards JWT in Authorization header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await callRpc('my-jwt-12345', 'start_room', { p_room_id: 'uuid' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer my-jwt-12345')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('serializes body as JSON', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await callRpc('jwt', 'create_room', {
      p_title: 'Test',
      p_difficulty: 3,
    })

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.body).toBe(JSON.stringify({ p_title: 'Test', p_difficulty: 3 }))
  })

  it('maps PostgREST P0001 error to RoomError 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'P0001',
          message: 'Authentication required',
        }),
        { status: 401 },
      ),
    ) as unknown as typeof fetch

    const result = await callRpc('jwt', 'create_room', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('P0001')
      expect(result.error.status).toBe(401)
      expect(result.error.message).toBe('Yetki yok')
    }
  })

  it('maps P0006 (oda dolu) error to 409', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'P0006', message: 'Oda dolu' }),
        { status: 400 }, // PostgREST returns 400 for RAISE EXCEPTION; we map by code
      ),
    ) as unknown as typeof fetch

    const result = await callRpc('jwt', 'join_room', { p_code: 'FULLLL' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('P0006')
      expect(result.error.status).toBe(409)
    }
  })

  it('handles network errors (502)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await callRpc('jwt', 'create_room', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN')
      expect(result.error.status).toBe(502)
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })

  it('handles unparseable response body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      // 2xx but body not JSON
      new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    ) as unknown as typeof fetch

    const result = await callRpc('jwt', 'create_room', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN')
      expect(result.error.message).toContain('parse')
    }
  })

  it('handles non-JSON error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('500 Internal Server Error', { status: 500 }),
    ) as unknown as typeof fetch

    const result = await callRpc('jwt', 'create_room', {})

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN')
      expect(result.error.status).toBe(500)
    }
  })
})
