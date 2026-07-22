import { describe, expect, it } from 'vitest'
import { buildCoachPrompt, fallbackHint, leaksAnswer } from '../hints'

describe('Bilge Koc hint guard', () => {
  it('prompt nihai cevap yasagini ve server baglamini tasir', () => {
    const prompt = buildCoachPrompt('hint2', {
      question: '2x + 3 = 11 ise x kaçtır?',
      category: 'denklemler',
      topic: 'birinci derece denklemler',
      outcomeTitle: 'Denklem kurma',
    })
    expect(prompt).toContain('nihai sayısal sonucu')
    expect(prompt).toContain('<soru>2x + 3 = 11 ise x kaçtır?</soru>')
    expect(prompt).toContain('Denklem kurma')
  })

  it('acik secenek ve cevap metni sizintisini yakalar', () => {
    expect(leaksAnswer('Doğru cevap C seçeneğidir.', 'Sekiz', 'C')).toBe(true)
    expect(leaksAnswer('Sonuç olarak sekiz bulunur.', 'Sekiz', 'C')).toBe(true)
    expect(leaksAnswer('Önce bilinmeyeni yalnız bırak.', 'Sekiz', 'C')).toBe(false)
  })

  it('kisa cevap metninde false-positive uretmez ve fallback verir', () => {
    expect(leaksAnswer('4 ile iki tarafı sadeleştir.', '4', 'B')).toBe(false)
    expect(leaksAnswer('Sonuç 4 olur.', '4', 'B')).toBe(true)
    expect(leaksAnswer('x = 3', '3', 'C')).toBe(true)
    expect(fallbackHint('hint3')).toContain('adım adım')
  })
})
