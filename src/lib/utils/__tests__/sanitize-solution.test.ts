import { describe, it, expect } from 'vitest'
import { stripSolutionLetterRefs } from '../sanitize-solution'

describe('stripSolutionLetterRefs (Codex PR#250 defense-in-depth)', () => {
  it('trailing "Doğru cevap X seçeneğidir" ifadesini siler, açıklamayı korur', () => {
    expect(stripSolutionLetterRefs('Momentum p = m·v = 24 kg·m/s. Doğru cevap D seçeneğidir.'))
      .toBe('Momentum p = m·v = 24 kg·m/s.')
  })

  it('"X seçeneği yanlıştır" → "ilgili seçenek yanlıştır"', () => {
    expect(stripSolutionLetterRefs('Bu nedenle C seçeneği yanlıştır.'))
      .toBe('Bu nedenle ilgili seçenek yanlıştır.')
  })

  it('"Seçenek B" ve "B şıkkı" kalıplarını nötrler', () => {
    expect(stripSolutionLetterRefs('Seçenek B doğrudur; A şıkkı çeldirici.'))
      .toBe('ilgili seçenek doğrudur; ilgili seçenek çeldirici.')
  })

  it('harf-referansı OLMAYAN çözümü değiştirmez', () => {
    const s = 'Klor atom numarası 17 olduğundan 17 elektronu vardır.'
    expect(stripSolutionLetterRefs(s)).toBe(s)
  })

  it('Türkçe kelimelerdeki a-e harflerini yanlışlıkla bozmaz (standalone değil)', () => {
    const s = 'Ve bu cevap doğrudur çünkü değerler eşittir.'
    expect(stripSolutionLetterRefs(s)).toBe(s)
  })

  it('boş/null güvenli', () => {
    expect(stripSolutionLetterRefs('')).toBe('')
  })
})
