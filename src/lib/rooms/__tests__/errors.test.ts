/**
 * Bilge Arena Oda Sistemi: errors.ts unit tests
 * Sprint 1 PR3
 */

import { describe, it, expect } from 'vitest'
import { normalizeRoomError, toResponse, ROOM_ERROR_CODES, ROOM_ERROR_HTTP_STATUS } from '../errors'

describe('normalizeRoomError', () => {
  it('maps P00xx code to friendly message + HTTP status', () => {
    const err = normalizeRoomError({ code: 'P0001', message: 'Authentication required' })
    expect(err.code).toBe('P0001')
    expect(err.message).toBe('Yetki yok')
    expect(err.status).toBe(401)
  })

  it('maps P0008 (oda kodu bulunamadi) to 404', () => {
    const err = normalizeRoomError({ code: 'P0008' })
    expect(err.status).toBe(404)
    expect(err.message).toBe('Oda kodu bulunamadi')
  })

  it('maps P0010 (sure doldu) to 410 Gone', () => {
    const err = normalizeRoomError({ code: 'P0010' })
    expect(err.status).toBe(410)
  })

  it('maps P0012 (race fix late submit) to 410 Gone', () => {
    const err = normalizeRoomError({ code: 'P0012' })
    expect(err.code).toBe('P0012')
    expect(err.status).toBe(410)
    expect(err.message).toBe('Round zaten reveal edildi')
  })

  it('maps P0013 (cluster dolu) to 503', () => {
    const err = normalizeRoomError({ code: 'P0013' })
    expect(err.status).toBe(503)
  })

  it('returns UNKNOWN for non-P00xx codes', () => {
    const err = normalizeRoomError({ code: '23505', message: 'duplicate key' })
    expect(err.code).toBe('UNKNOWN')
    expect(err.message).toBe('duplicate key')
    expect(err.status).toBe(500)
  })

  it('handles plain Error objects', () => {
    const err = normalizeRoomError(new Error('Network timeout'))
    expect(err.code).toBe('UNKNOWN')
    expect(err.message).toBe('Network timeout')
    expect(err.status).toBe(500)
  })

  it('handles null/undefined gracefully', () => {
    expect(normalizeRoomError(null).code).toBe('UNKNOWN')
    expect(normalizeRoomError(undefined).code).toBe('UNKNOWN')
  })

  it('handles object without message field', () => {
    const err = normalizeRoomError({ random: 'data' })
    expect(err.code).toBe('UNKNOWN')
    expect(err.status).toBe(500)
  })
})

describe('toResponse', () => {
  it('formats RoomError to NextResponse-compatible body+status', () => {
    const err = normalizeRoomError({ code: 'P0007' })
    const res = toResponse(err)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Zaten uyesin', code: 'P0007' })
  })
})

describe('ROOM_ERROR_CODES catalog', () => {
  it('has 13 distinct error codes (P0001-P0013)', () => {
    expect(Object.keys(ROOM_ERROR_CODES)).toHaveLength(13)
    for (let i = 1; i <= 13; i++) {
      const code = `P00${String(i).padStart(2, '0')}` as keyof typeof ROOM_ERROR_CODES
      expect(ROOM_ERROR_CODES[code]).toBeDefined()
    }
  })

  it('every code has HTTP status mapping', () => {
    for (const code of Object.keys(ROOM_ERROR_CODES)) {
      expect(ROOM_ERROR_HTTP_STATUS[code as keyof typeof ROOM_ERROR_HTTP_STATUS]).toBeGreaterThan(0)
    }
  })
})
