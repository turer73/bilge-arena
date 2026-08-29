import { afterEach, describe, expect, it, vi } from 'vitest'
import { getInterBoldUrl } from '../font-url'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getInterBoldUrl', () => {
  it('uses the validated Vercel deployment host for preview isolation', () => {
    vi.stubEnv('VERCEL_URL', 'bilge-arena-preview-123.vercel.app')
    expect(getInterBoldUrl()).toBe(
      'https://bilge-arena-preview-123.vercel.app/fonts/Inter-Bold.woff',
    )
  })

  it('rejects an untrusted deployment host and falls back to production', () => {
    vi.stubEnv('VERCEL_URL', 'attacker.example')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://attacker.example')
    expect(getInterBoldUrl()).toBe('https://bilgearena.com/fonts/Inter-Bold.woff')
  })

  it('allows localhost only outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    expect(getInterBoldUrl()).toBe('http://localhost:3000/fonts/Inter-Bold.woff')
  })
})
