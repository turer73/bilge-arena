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
    expect(redactChatPersonalData('Telefon: 905321234567 veya 90 212 555 44 33.'))
      .toBe('Telefon: [TELEFON] veya [TELEFON].')
    expect(redactChatPersonalData('Alan kodu 212 555 44 33.'))
      .toBe('Alan kodu [TELEFON].')
    expect(redactChatPersonalData('tel05321234567 veya numaram05321234567'))
      .toBe('tel[TELEFON] veya numaram[TELEFON]')
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
    expect(redactChatPersonalData('3141592653 sayısının rakamları toplamı nedir?'))
      .toBe('3141592653 sayısının rakamları toplamı nedir?')
  })

  it('masks internationalized email domains', () => {
    expect(redactChatPersonalData('Veli: veli@örnek.com'))
      .toBe('Veli: [E-POSTA]')
    expect(redactChatPersonalData('Veli: veli@o\u0308rnek.com'))
      .toBe('Veli: [E-POSTA]')
  })
})
