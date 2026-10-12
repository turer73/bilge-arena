import { describe, it, expect } from 'vitest'
import { getClientIp } from '../client-ip'

function H(map: Record<string, string>): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(map)) h.set(k, v)
  return h
}

describe('getClientIp — Vercel edge trust boundary', () => {
  it('uses the Vercel-overwritten XFF value even when cf-connecting-ip is supplied', () => {
    expect(getClientIp(H({
      'cf-connecting-ip': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
      'x-forwarded-for': '3.3.3.3',
    }))).toBe('3.3.3.3')
  })

  it('uses the nearest XFF hop, never the client-controlled leftmost entry', () => {
    expect(getClientIp(H({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.10.11.12',
    }))).toBe('9.10.11.12')
  })

  it('accepts an IPv6 address', () => {
    expect(getClientIp(H({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
  })

  it('does not trust cf-connecting-ip or x-real-ip without XFF', () => {
    expect(getClientIp(H({
      'cf-connecting-ip': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
    }))).toBe('unknown')
  })

  it.each(['', ' , , ', 'attacker-controlled', '1.2.3.4, invalid'])('fails closed for malformed XFF %j', (value) => {
    expect(getClientIp(H({ 'x-forwarded-for': value }))).toBe('unknown')
  })

  it('fails closed without any trusted header', () => {
    expect(getClientIp(H({}))).toBe('unknown')
  })
})
