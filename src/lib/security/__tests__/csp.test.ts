import { describe, expect, it } from 'vitest'
import {
  buildSensitiveDocumentCsp,
  createCspNonce,
  SENSITIVE_CSP_HEADER,
} from '../csp'

describe('sensitive document CSP', () => {
  it('builds a production nonce-only script boundary', () => {
    const csp = buildSensitiveDocumentCsp('known-nonce')

    expect(SENSITIVE_CSP_HEADER).toBe('Content-Security-Policy')
    expect(csp).toContain("script-src 'self' 'nonce-known-nonce' 'strict-dynamic'")
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).toContain("style-src-elem 'self' 'nonce-known-nonce'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toMatch(/googlesyndication|googletagmanager|analytics\.panola|plausible/i)
  })

  it('permits eval only for the local development runtime', () => {
    expect(buildSensitiveDocumentCsp('dev', { development: true }))
      .toContain("'unsafe-eval'")
  })

  it('encodes generated entropy as a CSP-safe nonce', () => {
    const nonce = createCspNonce('00000000-0000-4000-8000-000000000000')
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(nonce).not.toContain('-')
  })
})
