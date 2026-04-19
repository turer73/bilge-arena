import { describe, it, expect } from 'vitest'
import { validateEmail, getEmailErrorMessage } from '../email'

describe('validateEmail', () => {
  it('gecerli email trim + lowercase normalize eder', () => {
    const result = validateEmail('  User@Domain.COM  ')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.normalized).toBe('user@domain.com')
  })

  it('bos string empty reason ile reddeder', () => {
    const result = validateEmail('')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('empty')
  })

  it('sadece bosluk empty reason ile reddeder', () => {
    const result = validateEmail('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('empty')
  })

  it('at isareti yoksa invalid reddeder', () => {
    const result = validateEmail('userdomain.com')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid')
  })

  it('domain tld yoksa invalid reddeder', () => {
    const result = validateEmail('user@domain')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid')
  })

  it('bosluklu email invalid reddeder', () => {
    const result = validateEmail('user name@domain.com')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid')
  })

  it('cift @ invalid reddeder', () => {
    const result = validateEmail('user@@domain.com')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid')
  })

  it('254 karakterden uzun email too_long reddeder', () => {
    const longLocal = 'a'.repeat(250)
    const result = validateEmail(`${longLocal}@x.co`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_long')
  })

  it('subdomain icerikli email gecerli', () => {
    const result = validateEmail('user@mail.example.com')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.normalized).toBe('user@mail.example.com')
  })

  it('+ tag iceren email gecerli (gmail aliases)', () => {
    const result = validateEmail('user+tag@gmail.com')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.normalized).toBe('user+tag@gmail.com')
  })
})

describe('getEmailErrorMessage', () => {
  it('her reason icin Turkce mesaj doner', () => {
    expect(getEmailErrorMessage('empty')).toContain('bos')
    expect(getEmailErrorMessage('invalid')).toContain('ornek')
    expect(getEmailErrorMessage('too_long')).toContain('uzun')
  })
})
