import { describe, it, expect } from 'vitest'
import { isCsrfOriginAllowed, CSRF_PROTECTED_METHODS } from '../csrf'

function makeHeaders(init: Record<string, string>): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(init)) h.set(k, v)
  return h
}

describe('CSRF_PROTECTED_METHODS', () => {
  it('includes state-changing HTTP methods', () => {
    expect(CSRF_PROTECTED_METHODS.has('POST')).toBe(true)
    expect(CSRF_PROTECTED_METHODS.has('PUT')).toBe(true)
    expect(CSRF_PROTECTED_METHODS.has('PATCH')).toBe(true)
    expect(CSRF_PROTECTED_METHODS.has('DELETE')).toBe(true)
  })

  it('excludes safe methods', () => {
    expect(CSRF_PROTECTED_METHODS.has('GET')).toBe(false)
    expect(CSRF_PROTECTED_METHODS.has('HEAD')).toBe(false)
    expect(CSRF_PROTECTED_METHODS.has('OPTIONS')).toBe(false)
  })
})

describe('isCsrfOriginAllowed', () => {
  describe('static allowlist', () => {
    it('allows bilgearena.com origin', () => {
      const h = makeHeaders({ origin: 'https://bilgearena.com' })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })

    it('allows www.bilgearena.com origin', () => {
      const h = makeHeaders({ origin: 'https://www.bilgearena.com' })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })

    it('allows referer when origin missing', () => {
      const h = makeHeaders({ referer: 'https://bilgearena.com/oyun/matematik' })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })
  })

  describe('dynamic allowlist', () => {
    it('allows vercel preview bilge-arena-*.vercel.app', () => {
      const h = makeHeaders({ origin: 'https://bilge-arena-abc123.vercel.app' })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })

    it('allows localhost dev', () => {
      const h = makeHeaders({ origin: 'http://localhost:3000' })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })

    it('allows 127.0.0.1', () => {
      const h = makeHeaders({ origin: 'http://127.0.0.1:3000' })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })
  })

  describe('rejection (attack scenarios)', () => {
    it('rejects no origin and no referer', () => {
      const h = makeHeaders({})
      expect(isCsrfOriginAllowed(h)).toBe(false)
    })

    it('rejects external attacker origin', () => {
      const h = makeHeaders({ origin: 'https://evil.com' })
      expect(isCsrfOriginAllowed(h)).toBe(false)
    })

    it('rejects bilgearena.com.evil.com (host header injection)', () => {
      const h = makeHeaders({ origin: 'https://bilgearena.com.evil.com' })
      expect(isCsrfOriginAllowed(h)).toBe(false)
    })

    it('rejects http://bilgearena.com (insecure scheme)', () => {
      const h = makeHeaders({ origin: 'http://bilgearena.com' })
      expect(isCsrfOriginAllowed(h)).toBe(false)
    })

    it('rejects other-arena.vercel.app (similar but not bilge-arena prefix)', () => {
      const h = makeHeaders({ origin: 'https://other-arena.vercel.app' })
      expect(isCsrfOriginAllowed(h)).toBe(false)
    })

    it('rejects malformed referer gracefully', () => {
      const h = makeHeaders({ referer: 'not-a-url' })
      expect(isCsrfOriginAllowed(h)).toBe(false)
    })

    it('rejects bilge-arena.evil.app (subdomain trickery)', () => {
      const h = makeHeaders({ origin: 'https://bilge-arena.evil.app' })
      expect(isCsrfOriginAllowed(h)).toBe(false)
    })
  })

  describe('origin takes precedence over referer', () => {
    it('accepts when origin allowed even if referer bad', () => {
      const h = makeHeaders({
        origin: 'https://bilgearena.com',
        referer: 'https://evil.com/attack',
      })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })

    it('falls back to referer when origin missing', () => {
      const h = makeHeaders({ referer: 'https://bilgearena.com/foo' })
      expect(isCsrfOriginAllowed(h)).toBe(true)
    })
  })
})
