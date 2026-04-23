import { describe, it, expect } from 'vitest'
import {
  trLower,
  trUpper,
  trCompare,
  trIncludes,
  trDeaccent,
  trSlug,
  trNormalize,
} from '../tr-text'

// ═══════════════════════════════════════════════════════════════════════
// trLower — Turkce locale lowercase
// ═══════════════════════════════════════════════════════════════════════
describe('trLower', () => {
  it('buyuk ASCII I noktasiz i (U+0131) ya donusur', () => {
    // "I" (ASCII U+0049) + tr-TR locale → "ı" (U+0131 noktasiz i)
    expect(trLower('ISIK')).toBe('ısık')
  })

  it('buyuk noktali I (U+0130) noktali i (U+0069) ya donusur', () => {
    expect(trLower('İSTANBUL')).toBe('istanbul')
  })

  it('IŞIK (noktasiz I + S) -> ışık (noktasiz i + s)', () => {
    // Turkce "IŞIK": I(U+0049) + Ş(U+015E) + I(U+0049) + K
    // Lowercase: ı + ş + ı + k = ışık
    expect(trLower('IŞIK')).toBe('ışık')
  })

  it('karma buyuk kucuk dogru lowercase yapar', () => {
    expect(trLower('İSTanBUL')).toBe('istanbul')
  })

  it('zaten kucuk harfli metinde degisiklik yok', () => {
    expect(trLower('istanbul')).toBe('istanbul')
  })

  it('Turkce ozel harfler korunur', () => {
    expect(trLower('ÇÖĞÜŞ')).toBe('çöğüş')
  })

  it('JavaScript default toLowerCase\'den farkli sonuc uretir (regression)', () => {
    // Default JS: "İSTANBUL".toLowerCase() -> kombine isaretli "i̇stanbul" (bozuk)
    // Turkce:     trLower("İSTANBUL")       -> "istanbul" (temiz)
    const jsDefault = 'İSTANBUL'.toLowerCase()
    const turkish = trLower('İSTANBUL')
    expect(turkish).toBe('istanbul')
    expect(jsDefault).not.toBe(turkish)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// trUpper — Turkce locale uppercase
// ═══════════════════════════════════════════════════════════════════════
describe('trUpper', () => {
  it('noktali i buyuk noktali İ ye donusur', () => {
    expect(trUpper('istanbul')).toBe('İSTANBUL')
  })

  it('noktasiz i buyuk I ya donusur', () => {
    expect(trUpper('ışık')).toBe('IŞIK')
  })

  it('karma kucuk harfi dogru uppercase yapar', () => {
    expect(trUpper('İstanbul')).toBe('İSTANBUL')
  })

  it('JavaScript default toUpperCase\'den farkli sonuc uretir (regression)', () => {
    // Default JS: "istanbul".toUpperCase() = "ISTANBUL" (yanlis, noktasiz I)
    // Turkce:     trUpper("istanbul")      = "İSTANBUL" (dogru, noktali İ)
    expect('istanbul'.toUpperCase()).toBe('ISTANBUL')
    expect(trUpper('istanbul')).toBe('İSTANBUL')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// trCompare — Locale compare (base sensitivity)
// ═══════════════════════════════════════════════════════════════════════
describe('trCompare', () => {
  it('esit stringler icin 0 doner', () => {
    expect(trCompare('özkan', 'özkan')).toBe(0)
  })

  it('buyuk kucuk fark gozetmez', () => {
    expect(trCompare('Özkan', 'özkan')).toBe(0)
  })

  it('alfabetik siralama Turkce kurallarina uyar', () => {
    // Turkce alfabe: c < ç, g < ğ, i < ı... HAYIR! Turkcede i < ı
    // Aslinda: c, ç, d ... g, ğ, h ... i, ı, j ...
    const result = trCompare('çakal', 'cetin')
    expect(result).toBeGreaterThan(0) // c < ç
  })
})

// ═══════════════════════════════════════════════════════════════════════
// trIncludes — Case-insensitive Turkish contains
// ═══════════════════════════════════════════════════════════════════════
describe('trIncludes', () => {
  it('buyuk kucuk duyarsiz eslesme yapar', () => {
    expect(trIncludes('Merhaba Dünya', 'dünya')).toBe(true)
  })

  it('Turkce karakter icin dogru calisir', () => {
    expect(trIncludes('İSTANBUL ŞEHRİ', 'istanbul')).toBe(true)
  })

  it('bos needle her zaman true', () => {
    expect(trIncludes('herhangi bir metin', '')).toBe(true)
  })

  it('eslesmez ise false doner', () => {
    expect(trIncludes('İstanbul', 'Ankara')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// trDeaccent — Diakritik kaldirma
// ═══════════════════════════════════════════════════════════════════════
describe('trDeaccent', () => {
  it('6 Turkce karakter ciftini ASCII muadiline cevirir', () => {
    expect(trDeaccent('çğıöşü')).toBe('cgiosu')
    expect(trDeaccent('ÇĞİÖŞÜ')).toBe('CGIOSU')
  })

  it('ASCII karakterlere dokunmaz', () => {
    expect(trDeaccent('Hello World 123')).toBe('Hello World 123')
  })

  it('karma metinde sadece Turkce karakterleri degistirir', () => {
    expect(trDeaccent('İstanbul Şehri')).toBe('Istanbul Sehri')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// trSlug — URL slug uretimi
// ═══════════════════════════════════════════════════════════════════════
describe('trSlug', () => {
  it('Turkce kelimeyi ASCII slug a cevirir', () => {
    expect(trSlug('Ördek Yavrusu')).toBe('ordek-yavrusu')
  })

  it('bosluklari tire ile birlestirir', () => {
    expect(trSlug('İstanbul 2026 Baharı')).toBe('istanbul-2026-bahari')
  })

  it('cift bosluklari tek tireye indirir', () => {
    expect(trSlug('  Cift   Bosluklu  ')).toBe('cift-bosluklu')
  })

  it('alfanumerik olmayan karakterleri siler', () => {
    expect(trSlug('Merhaba! Dünya?')).toBe('merhaba-dunya')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// trNormalize — Accent-insensitive lookup
// ═══════════════════════════════════════════════════════════════════════
describe('trNormalize', () => {
  it('diakritik duyarsiz esitlik saglar', () => {
    expect(trNormalize('Özkan')).toBe(trNormalize('ozkan'))
    expect(trNormalize('İstanbul')).toBe(trNormalize('istanbul'))
    expect(trNormalize('ÇAĞLAR')).toBe(trNormalize('caglar'))
  })

  it('arama senaryosu: kullanici aksansiz yazsa bile bulur', () => {
    const profiles = ['Özkan Yılmaz', 'Şule Öztürk', 'İbrahim Çelik']
    const query = 'ozkan'
    const match = profiles.find(p => trNormalize(p).includes(trNormalize(query)))
    expect(match).toBe('Özkan Yılmaz')
  })
})
