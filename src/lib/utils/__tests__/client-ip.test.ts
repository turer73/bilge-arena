import { describe, it, expect } from 'vitest'
import { getClientIp } from '../client-ip'

function H(map: Record<string, string>): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(map)) h.set(k, v)
  return h
}

describe('getClientIp — anti-XFF-spoof', () => {
  it('prefers cf-connecting-ip when present', () => {
    expect(
      getClientIp(
        H({
          'cf-connecting-ip': '1.1.1.1',
          'x-real-ip': '2.2.2.2',
          'x-forwarded-for': '3.3.3.3, 4.4.4.4',
        }),
      ),
    ).toBe('1.1.1.1')
  })

  it('falls back to x-real-ip when cf-connecting-ip missing', () => {
    expect(
      getClientIp(
        H({
          'x-real-ip': '2.2.2.2',
          'x-forwarded-for': '3.3.3.3, 4.4.4.4',
        }),
      ),
    ).toBe('2.2.2.2')
  })

  it('uses XFF RIGHTMOST entry (trusted hop), not leftmost (client-controlled)', () => {
    expect(
      getClientIp(
        H({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12' }),
      ),
    ).toBe('9.10.11.12')
  })

  it('handles single XFF entry', () => {
    expect(getClientIp(H({ 'x-forwarded-for': '8.8.8.8' }))).toBe('8.8.8.8')
  })

  it('trims whitespace in XFF entries', () => {
    expect(getClientIp(H({ 'x-forwarded-for': '  1.1.1.1 ,  2.2.2.2  ' }))).toBe('2.2.2.2')
  })

  it('returns "unknown" when no trusted header set', () => {
    expect(getClientIp(H({}))).toBe('unknown')
  })

  it('returns "unknown" for empty XFF', () => {
    expect(getClientIp(H({ 'x-forwarded-for': '' }))).toBe('unknown')
  })

  it('returns "unknown" for whitespace-only XFF', () => {
    expect(getClientIp(H({ 'x-forwarded-for': ' , , ' }))).toBe('unknown')
  })

  it('SECURITY: attacker spoofing leftmost XFF entry does NOT win', () => {
    // Saldirgan: X-Forwarded-For: ATTACKER, real-trusted-proxy
    expect(
      getClientIp(
        H({ 'x-forwarded-for': '1.1.1.1, 192.168.1.1, 10.0.0.1' }),
      ),
    ).toBe('10.0.0.1')
    // Eger split(',')[0] kullanilsaydi 1.1.1.1 (attacker) donerdi -> her
    // istekte farkli IP -> rate limit bypass
  })

  it('SECURITY: cf-connecting-ip overrides spoofed XFF', () => {
    // Cloudflare arkasinda gercek client = cf-connecting-ip
    // Saldirgan XFF'yi spoof etse bile cf-connecting-ip kazanir
    expect(
      getClientIp(
        H({
          'cf-connecting-ip': '203.0.113.5',
          'x-forwarded-for': 'spoofed-1, spoofed-2, spoofed-3',
        }),
      ),
    ).toBe('203.0.113.5')
  })
})
