import { describe, it, expect } from 'vitest'
import {
  trLower,
  trUpper,
  trCompare,
  trIncludes,
  trDeaccent,
  trSlug,
  trNormalize,
  isLikelyTurkish,
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

// ═══════════════════════════════════════════════════════════════════════
// isLikelyTurkish — AI uretim solution dilinin Turkce olmasini dogrular
// ═══════════════════════════════════════════════════════════════════════
// 2026-04-26: wordquest C2 prompt'u Ingilizce rubrik kullaninca Gemini cozumleri
// Ingilizce uretti (10 satir gozlemlendi). Bu helper drift'i runtime'da
// yakalamak icin: route insert oncesi her wordquest solution'i bu fonksiyondan
// gecirir, false donerse o satir filtrelenir (insert edilmez).
//
// Heuristic kararlari:
//   - Cok kisa metin (< 30 char): emin olunamaz, lenient kabul (true).
//   - Turkce-ozel karakter (ç ğ ı ö ş ü) iceriyorsa: kuvvetli sinyal, true.
//   - Turkce stopword (bir, bu, ve, ile, kelime, anlam...) iceriyorsa: ikincil sinyal.
//   - Uzun metin + iki sinyal de yok: false (muhtemelen Ingilizce).
describe('isLikelyTurkish', () => {
  it('bos veya whitespace-only metin false doner', () => {
    expect(isLikelyTurkish('')).toBe(false)
    expect(isLikelyTurkish('   ')).toBe(false)
  })

  it('cok kisa metin (< 30 char) lenient kabul edilir (true)', () => {
    // Kisa metinde dil tespiti guvenilir degil — false-positive (gecerli kisa
    // turkce'yi reddetmek) maliyetli. Lenient davranis kasitli.
    expect(isLikelyTurkish('elated = cok mutlu')).toBe(true) // 18 char, no Turkish chars
    expect(isLikelyTurkish('Ok')).toBe(true)
  })

  it('Turkce-spesifik karakter iceren uzun metni Turkce kabul eder', () => {
    expect(isLikelyTurkish('Bu çözüm doğru cevabın açıklamasıdır ve oldukça önemlidir.')).toBe(true)
    // Tek karakter bile yeterli — strong signal
    expect(isLikelyTurkish('Undaunted kelimesi cesur, korkmayan anlamına gelir bence.')).toBe(true)
  })

  it('Turkce stopword iceren uzun ASCII metni Turkce kabul eder', () => {
    // Turkce-ozel karakter olmadan da, stopword'lerden taninabilir
    // ('bir', 've', 'bu', 'kelime', 'anlam' gibi)
    expect(isLikelyTurkish('Synonym: elated bu kelime cok mutlu anlam tasiyor demektir bence.')).toBe(true)
  })

  it('uzun saf Ingilizce metni reddeder (drift detection)', () => {
    // Bu test C2 drift senaryosunun runtime guard'ini dogrular
    const englishSolution = 'Undaunted means not intimidated or discouraged by difficulty, loss, or danger. It fits the context well.'
    expect(isLikelyTurkish(englishSolution)).toBe(false)
  })

  it('English false-positive guard: stopword regex word-boundary kontrolu yapar', () => {
    // "every" icinde "ve" gecer ama \b sayesinde eslesmemeli
    // "bird" icinde "bir" gecer ama \b sayesinde eslesmemeli
    // "blue" icinde "ile" yok — emin olmak icin
    const englishWithSubstrings = 'Every bird flies above the blue ocean during the morning hours of summer.'
    expect(isLikelyTurkish(englishWithSubstrings)).toBe(false)
  })

  it('C2 drift gercek ornegi (Apr 2026 production data): reddedilir', () => {
    // Yasanmis vaka: Gemini prompt drift sonucu ureten solution'lardan ornek
    const realDriftCase = 'Veiled means not expressed directly, which aligns with language chosen to be careful and avoid escalation, implying indirectness.'
    expect(isLikelyTurkish(realDriftCase)).toBe(false)
  })
})
