import { describe, expect, it } from 'vitest'
import {
  authoredCoachText,
  buildCoachPrompt,
  coachSourceLabel,
  evaluateCoachText,
  fallbackHint,
  leaksAnswer,
} from '../hints'

describe('Bilge Koç hint guard', () => {
  it('prompt nihai cevap yasağını ve yalnız onaylı server bağlamını taşır', () => {
    const prompt = buildCoachPrompt('hint2', {
      question: '2x + 3 = 11 ise x kaçtır?',
      category: 'denklemler',
      topic: 'birinci derece denklemler',
      outcomeTitle: 'Denklem kurma',
      selectedOptionText: 'x = 3',
      solution: '2x = 8 olduğundan x = 4 bulunur.',
    })
    expect(prompt).toContain('nihai sonucunu')
    expect(prompt).toContain('<ONAYLI_BAĞLAM>')
    expect(prompt).toContain('Denklem kurma')
    expect(prompt).toContain('approvedSolution')
    expect(prompt).not.toContain('userId')
  })

  it('açık seçenek ve cevap metni sızıntısını yakalar', () => {
    expect(leaksAnswer('Doğru cevap C seçeneğidir.', 'Sekiz', 'C')).toBe(true)
    expect(leaksAnswer('Sonuç olarak sekiz bulunur.', 'Sekiz', 'C')).toBe(true)
    expect(leaksAnswer('Önce bilinmeyeni yalnız bırak.', 'Sekiz', 'C')).toBe(false)
  })

  it('kısa cevap metninde false-positive üretmez ve örnek fallback verir', () => {
    expect(leaksAnswer('4 ile iki tarafı sadeleştir.', '4', 'B')).toBe(false)
    expect(leaksAnswer('Sonuç 4 olur.', '4', 'B')).toBe(true)
    expect(leaksAnswer('x = 3', '3', 'C')).toBe(true)
    expect(leaksAnswer('Sonuç sekiz olur.', '8', 'B')).toBe(true)
    expect(leaksAnswer('Sonuç 8 olur.', 'Sekiz', 'B')).toBe(true)
    expect(fallbackHint('hint3')).toContain('Küçük örnek')
  })

  it('küratörlü yanılgı ve ipucunu yalnız tam metadata ile kurar', () => {
    const content = {
      question: '2 + 2?',
      options: ['3', '4'],
      answer: 1,
      solution: 'İki ile iki toplanır.',
      coach: {
        misconceptions: ['Toplama yerine çıkarma yapılmış olabilir.', 'İşlem doğru kurulmuş olabilir.'],
        hint1: 'İki grubu birlikte say.',
        hint2: 'Toplama işlemini yaz.',
        miniExample: '1 + 2 = 3 örneğini düşün.',
      },
    }
    expect(authoredCoachText('hint1', content, 0)).toContain('Olası yanılgı')
    expect(authoredCoachText('hint2', content, 0)).toBe('Toplama işlemini yaz.')
    expect(authoredCoachText('hint3', content, 0)).toBe('1 + 2 = 3 örneğini düşün.')
    expect(authoredCoachText('hint1', { ...content, coach: undefined }, 0)).toBeNull()
  })

  it('public olmadan önce uzunluk, prompt ve cevap sızıntısı değerlendirmesi yapar', () => {
    expect(evaluateCoachText(
      'hint1',
      'Olası odak: işlem sırası karışmış olabilir. Önce çarpma adımını işaretle.',
      'Sekiz',
      'B',
    )).toBe(true)
    expect(evaluateCoachText('hint1', 'Doğru cevap B seçeneğidir.', 'Sekiz', 'B')).toBe(false)
    expect(evaluateCoachText('hint2', '<script>alert(1)</script>', 'Sekiz', 'B')).toBe(false)
    expect(coachSourceLabel('approved_transfer')).toBe('Onaylı soru bankası')
  })
})
