import { describe, expect, it } from 'vitest'
import { redactChatPersonalData } from '../chat-redaction'

describe('redactChatPersonalData', () => {
  it('masks email and Turkish mobile/landline numbers', () => {
    expect(redactChatPersonalData('Bana Ada.Test+okul@ornek.com ve +90 (532) 123 45 67 ile ulaş.'))
      .toBe('Bana [E-POSTA] ve [TELEFON] ile ulaş.')
    expect(redactChatPersonalData('Sabit hat: 0212 555 44 33.'))
      .toBe('Sabit hat: [TELEFON].')
    expect(redactChatPersonalData('Telefonlar 5321234567 ve 0090 532 123 45 67.'))
      .toBe('Telefonlar [TELEFON] ve [TELEFON].')
  })

  it('masks valid Turkish identity numbers without replacing ordinary exercises', () => {
    expect(redactChatPersonalData('T.C. numaram 10000000146.'))
      .toBe('T.C. numaram [TC-KIMLIK].')
    expect(redactChatPersonalData('Kimlik: 100 000 001 46'))
      .toBe('Kimlik: [TC-KIMLIK]')
    expect(redactChatPersonalData('10000000147 sayısının basamakları toplamı nedir?'))
      .toContain('10000000147')
  })

  it('does not alter ordinary educational text', () => {
    expect(redactChatPersonalData('Birinci dereceden denklemleri anlat.'))
      .toBe('Birinci dereceden denklemleri anlat.')
  })
})
