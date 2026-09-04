import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateSupabaseTokenExpiry } from '../../scripts/sync-database-types.mjs'

const scriptPath = fileURLToPath(new URL('../../scripts/sync-database-types.mjs', import.meta.url))
const NOW = Date.parse('2026-09-04T12:00:00.000Z')

describe('database type drift credential guard', () => {
  it('requires the expiry metadata before invoking the Supabase CLI', () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: 'test-token-that-must-not-be-used',
        SUPABASE_TOKEN_EXPIRES_AT: '',
      },
      timeout: 5_000,
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SUPABASE_TOKEN_EXPIRES_AT is required')
    expect(result.stderr).not.toContain('Pinned Supabase CLI is missing')
  })

  it.each([
    '2026-12-04',
    '2026-12-04 00:00:00Z',
    '2026-12-04T03:00:00+03:00',
    '2026-12-04T00:00:00.12Z',
  ])('rejects non-canonical UTC value %s', (value) => {
    expect(() => validateSupabaseTokenExpiry(value, NOW)).toThrow(
      /strict UTC ISO-8601 timestamp/
    )
  })

  it('rejects impossible calendar timestamps', () => {
    expect(() =>
      validateSupabaseTokenExpiry('2026-02-30T00:00:00Z', NOW)
    ).toThrow(/not a real calendar timestamp/)
  })

  it('rejects expired credentials', () => {
    expect(() =>
      validateSupabaseTokenExpiry('2026-09-04T12:00:00Z', NOW)
    ).toThrow(/token is expired/)
  })

  it('accepts exact UTC seconds and warns inside the fourteen-day rotation window', () => {
    expect(
      validateSupabaseTokenExpiry('2026-09-18T12:00:00Z', NOW)
    ).toMatchObject({
      expiresAt: '2026-09-18T12:00:00Z',
      remainingDays: 14,
      shouldWarn: true,
    })
  })

  it('accepts exact UTC milliseconds without an early warning', () => {
    expect(
      validateSupabaseTokenExpiry('2026-12-04T00:00:00.000Z', NOW)
    ).toMatchObject({
      expiresAt: '2026-12-04T00:00:00.000Z',
      shouldWarn: false,
    })
  })
})
