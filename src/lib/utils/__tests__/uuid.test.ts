import { describe, it, expect } from 'vitest'
import { UUID_STRICT_PATTERN, isValidUuid, filterValidUuids } from '../uuid'

describe('UUID_STRICT_PATTERN', () => {
  it('accepts valid v4 UUIDs', () => {
    expect(UUID_STRICT_PATTERN.test('12345678-1234-1234-1234-123456789012')).toBe(true)
    expect(UUID_STRICT_PATTERN.test('abcdef00-1111-4222-8333-aaaaaaaaaaaa')).toBe(true)
  })

  it('accepts uppercase UUIDs', () => {
    expect(UUID_STRICT_PATTERN.test('ABCDEF00-1111-4222-8333-AAAAAAAAAAAA')).toBe(true)
  })

  it('rejects malformed dash positions (B3 vector)', () => {
    // Eski /^[0-9a-f-]{36}$/i bu string'leri kabul ederdi
    expect(UUID_STRICT_PATTERN.test('---------abc123def456abc123def456abc1')).toBe(false)
    expect(UUID_STRICT_PATTERN.test('1234567812341234123412345678901-')).toBe(false)
    expect(UUID_STRICT_PATTERN.test('-2345678-1234-1234-1234-12345678901')).toBe(false)
  })

  it('rejects non-hex characters', () => {
    expect(UUID_STRICT_PATTERN.test('zzzzzzzz-1234-1234-1234-123456789012')).toBe(false)
    expect(UUID_STRICT_PATTERN.test('12345678-1234-1234-1234-12345678901g')).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(UUID_STRICT_PATTERN.test('1234567-1234-1234-1234-123456789012')).toBe(false)  // 7 first
    expect(UUID_STRICT_PATTERN.test('123456789-1234-1234-1234-123456789012')).toBe(false) // 9 first
    expect(UUID_STRICT_PATTERN.test('12345678-1234-1234-1234-1234567890123')).toBe(false) // 13 last
    expect(UUID_STRICT_PATTERN.test('')).toBe(false)
  })

  it('rejects strings with surrounding whitespace', () => {
    expect(UUID_STRICT_PATTERN.test(' 12345678-1234-1234-1234-123456789012')).toBe(false)
    expect(UUID_STRICT_PATTERN.test('12345678-1234-1234-1234-123456789012 ')).toBe(false)
  })
})

describe('isValidUuid', () => {
  it('returns true for valid UUID', () => {
    expect(isValidUuid('12345678-1234-1234-1234-123456789012')).toBe(true)
  })

  it('returns false for non-string', () => {
    expect(isValidUuid(null)).toBe(false)
    expect(isValidUuid(undefined)).toBe(false)
    expect(isValidUuid(123)).toBe(false)
    expect(isValidUuid({})).toBe(false)
    expect(isValidUuid([])).toBe(false)
  })

  it('returns false for invalid string', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false)
    expect(isValidUuid('---------abc123def456abc123def456abc1')).toBe(false)
  })
})

describe('filterValidUuids', () => {
  it('keeps only valid UUIDs', () => {
    const valid = '12345678-1234-1234-1234-123456789012'
    const result = filterValidUuids([valid, 'not-uuid', null, 123, valid, ''])
    expect(result).toEqual([valid, valid])
  })

  it('caps at max (default 50)', () => {
    const valid = '12345678-1234-1234-1234-123456789012'
    const arr = Array(100).fill(valid)
    expect(filterValidUuids(arr)).toHaveLength(50)
  })

  it('respects custom max', () => {
    const valid = '12345678-1234-1234-1234-123456789012'
    const arr = Array(10).fill(valid)
    expect(filterValidUuids(arr, 3)).toHaveLength(3)
  })

  it('returns empty array when no valid UUIDs', () => {
    expect(filterValidUuids(['x', 'y', 'z'])).toEqual([])
  })
})
