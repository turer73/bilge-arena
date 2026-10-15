import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ISOLATED_TEST_ORIGIN,
  resolveAcademyServerSupabaseOrigin,
} from '@/lib/auth/isolated-test'

describe('resolveAcademyServerSupabaseOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('routes preview server clients directly to the isolated 3137 upstream', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BILGE_ISOLATED_TEST', 'true')
    vi.stubEnv('BILGE_ACADEMY_PREVIEW_BRIDGE', 'true')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:3141')

    expect(resolveAcademyServerSupabaseOrigin('http://localhost:3141')).toBe(
      ISOLATED_TEST_ORIGIN,
    )
  })

  it('preserves the configured origin outside the isolated preview bridge', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BILGE_ISOLATED_TEST', 'true')
    vi.stubEnv('BILGE_ACADEMY_PREVIEW_BRIDGE', 'true')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')

    expect(resolveAcademyServerSupabaseOrigin('https://project.supabase.co')).toBe(
      'https://project.supabase.co',
    )
  })
})
