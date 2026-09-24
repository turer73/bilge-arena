import { describe, expect, it } from 'vitest'
import { findingLabel, verdictLabel } from '../presentation'

describe('question audit presentation', () => {
  it('teknik kodları ihtiyatlı Türkçe ifadelerle açıklar', () => {
    expect(findingLabel('AMBIGUOUS_WORDING')).toBe('Birden fazla yorumlanabilen ifade')
    expect(findingLabel('UNKNOWN')).toBe('Tanımlanmamış bulgu')
    expect(verdictLabel('APPROVED')).toBe('Otomatik kontrol geçti')
    expect(verdictLabel('UNKNOWN')).toBe('Bilinmeyen doğrulama sonucu')
  })
})
