/**
 * Deterministik soru metni kusur taramasi — mantik testi.
 *
 * Canli veri CI'da yok; bu test bilincli-defektli satirlarla her kural sinifinin
 * yakalandigini ve bilinen FP kaynaklarinin (kisaltma, cok kelimeli ozel ad,
 * kimyasal formul, Ingilizce icerik) yakalanMAdigini kilitler. Ornekler
 * Antigravity Pilot 1-3 ve kullanici ekran goruntusundeki gercek kusurlardan
 * (icerik kisaltilarak) alinmistir.
 */
import { describe, expect, it } from 'vitest'
import {
  findAnswerCues,
  findAsciiDiacriticLoss,
  findMidSentenceCapitals,
  findMissingFigureReference,
  findSuperscriptLoss,
  scanQuestion,
  scanRevisions,
} from '../scan-question-text-defects.mjs'

const rules = (row) => scanQuestion(row).findings.map((f) => f.rule)

describe('ascii_diacritic_loss', () => {
  it('yakalar: ASCII govdeli Turkce sozcukler, duzeltme onerisiyle', () => {
    const hits = findAsciiDiacriticLoss('Bir kentin gelisimi yollarin uzunlugu ile olculmez, gunluk hayat ve kultur onemlidir.')
    expect(hits).toEqual(expect.arrayContaining([
      { ascii: 'gelisim', fixed: 'gelişim' }, { ascii: 'uzunlugu', fixed: 'uzunluğu' },
      { ascii: 'olculmez', fixed: 'ölçülmez' }, { ascii: 'gunluk', fixed: 'günlük' }, { ascii: 'kultur', fixed: 'kültür' },
    ]))
  })
  it('yakalamaz: dogru yazilmis sozcukler ve diakritik iceren govdeler', () => {
    expect(findAsciiDiacriticLoss('Aşağıdaki cümlelerin hangisinde yazım yanlışı vardır? Gelişim, günlük, kültür.')).toEqual([])
  })
  it('yakalamaz: WordQuest (Ingilizce) icerigi', () => {
    expect(rules({ game: 'wordquest', content: { sentence: 'The gunluk report was dogru.', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('ascii_diacritic_loss')
  })
  it('anlam degistiren kayip: "gerek" tek basina sayilmaz (ASCII halde de sozcuk), ama cevre kelimeler yakalanir', () => {
    // "gercek" -> "gerek" bir baska sozcuge donusur; listede bilerek yok. Cumlenin
    // geri kalanindaki kayip soruyu zaten bayraklar; insan hakem "gerek"i gorur.
    const hits = findAsciiDiacriticLoss('bir kentin gerek gelismislik olcutu nedir')
    // Regex en kisa govdeyi raporlar ("gelismis"); onemli olan sozcugun yakalanmasi.
    expect(hits.map((h) => h.ascii)).toEqual(expect.arrayContaining(['gelismis', 'olcut']))
    expect(hits.map((h) => h.ascii)).not.toContain('gerek')
  })
})

describe('mid_sentence_capital', () => {
  const words = (s) => findMidSentenceCapitals(s).map((c) => c.word)
  it('yakalar: cumle ortasinda buyuk harfli cins isim (Q38 "en Büyük" ipucu, ekran goruntusu)', () => {
    expect(words('Asagidakilerden hangisi dunyanin en Büyük okyanusudur?')).toEqual(['Büyük'])
    expect(words('Bir kentin Gerçek gelişmişliği, altyapıdan önce İnsan odaklı olmalıdır.')).toEqual(['Gerçek', 'İnsan'])
  })
  it('yakalamaz: cumle basi, tamamen buyuk kisaltma, bilinen ozel ad, roma rakami sonrasi', () => {
    expect(words('Kitabı okudum. Eve gittim! Neden? Çünkü TDK, MEB ve ÖSYM böyle diyor. I. Dünya Savaşı')).toEqual([])
  })
  it('yakalamaz: cok kelimeli ozel ad (İstanbul Boğazı, Pasifik Okyanusu, Türkiye Cumhuriyeti)', () => {
    expect(words('İstanbul Boğazı ve Türkiye Cumhuriyeti; Pasifik Okyanusu en büyüktür.')).toEqual([])
  })
  it('yakalamaz: Ingilizce icerik (locale en)', () => {
    expect(findMidSentenceCapitals('I met John near the Thames last Summer.', { locale: 'en' })).toEqual([])
  })
})

describe('figure_reference_without_media', () => {
  it('yakalar: kokte sekil/ok yonu var, icerikte gorsel alani yok (Pilot 1 Q21)', () => {
    const hits = findMissingFigureReference({ question: 'Şekildeki gibi basit bir devrede reosta ok yönünde çekilirse ne olur?' })
    expect(hits).toEqual([{ field: 'question', term: 'Şekildeki' }])
  })
  it('yakalamaz: gorsel alani doluysa', () => {
    expect(findMissingFigureReference({ question: 'Şekildeki devre', image: 'https://cdn/x.png' })).toEqual([])
  })
  it('yakalamaz: "tablo" sozcugu baska anlamda ("Tablo" ozel ad degil, ama "masa" da yakalanmaz)', () => {
    expect(findMissingFigureReference({ question: 'Periyodik cetvelin ilk grubu nedir?' })).toEqual([])
  })
})

describe('longest_option / stem_echo', () => {
  it('yakalar: dogru sik acik ara en uzun VE kok kelimelerini tekrar ediyor (ekran goruntusu)', () => {
    const cues = findAnswerCues({
      question: 'Bir kentin gerçek gelişmişliği günlük hayat kolaylığı, sosyal hizmet niteliği ve kültürel etkinliklere erişimden anlaşılır. Bu parçaya göre ölçüt nedir?',
      options: ['Binaların yüksekliği', 'Trafiğin azlığı', 'Vatandaşların günlük hayat kolaylığı, sosyal hizmet ve kültür erişimi', 'Saatlik nüfus yoğunluğu', 'Yolların uzunluğu'],
      answer: 2,
    })
    expect(cues.map((c) => c.cue)).toEqual(expect.arrayContaining(['longest_option', 'stem_echo']))
  })
  it('yakalamaz: siklar dengeli uzunlukta', () => {
    expect(findAnswerCues({ question: 'İki ile üçün toplamı kaçtır?', options: ['4', '5', '6', '7', '8'], answer: 1 })).toEqual([])
  })
  it('yakalamaz: en uzun sik yanlis cevapsa', () => {
    expect(findAnswerCues({ question: 'Hangisi doğrudur?', options: ['Kısa', 'Bu seçenek diğerlerinden çok daha uzun ve ayrıntılı bir ifadedir', 'Orta', 'Kısa da'], answer: 0 })).toEqual([])
  })
})

describe('superscript_loss', () => {
  it('yakalar: aritmetik baglamda harf+rakam (Pilot 2 Q4)', () => {
    expect(findSuperscriptLoss('x2+y2+z2=14 ve x+y+z=6').map((h) => h.token)).toEqual(['x2', 'y2', 'z2'])
  })
  it('yakalamaz: kimyasal formul ve indis (fen/wordquest icin kural atlanir; ayrica H2O aritmetik baglamda degil)', () => {
    expect(findSuperscriptLoss('H2O ve CO2 molekülleri', { skip: true })).toEqual([])
    expect(findSuperscriptLoss('H2O ve CO2 molekülleri')).toEqual([])
  })
  it('scanQuestion fen ve wordquest icin kurali atlar', () => {
    expect(rules({ game: 'fen', content: { question: 'x2+y2=1 çemberi', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('superscript_loss')
    expect(rules({ game: 'matematik', content: { question: 'x2+y2=1 çemberi', options: ['a', 'b', 'c'], answer: 0 } })).toContain('superscript_loss')
  })
})

describe('scanRevisions', () => {
  it('temiz soru bayraklanmaz; ozet sayaclar kural ve ders bazinda toplanir', () => {
    const report = scanRevisions([
      { id: 'clean', game: 'turkce', content: { question: 'Aşağıdaki cümlelerin hangisinde yazım yanlışı vardır?', options: ['Kitabı okudum.', 'Eve gittim.', 'Onu gördüm.', 'Bunu bildim.'], answer: 0 } },
      { id: 'dirty', game: 'sosyal', category: 'Cografya', content: { question: 'Asagidakilerden hangisi dunyanin en Büyük okyanusudur?', options: ['Atlas', 'Hint', 'Pasifik', 'Arktik'], answer: 2 } },
    ])
    expect(report.scanned).toBe(2)
    expect(report.flagged).toBe(1)
    expect(report.results[0].questionId).toBe('dirty')
    expect(report.byRule).toEqual(expect.objectContaining({ ascii_diacritic_loss: 1, mid_sentence_capital: 1 }))
    expect(report.byGame).toEqual({ sosyal: 1 })
  })
  it('hicbir bulgu karar degildir: rapor yalniz rule/severity/detail tasir, is_active/answer degistirmez', () => {
    const row = { id: 'x', game: 'sosyal', content: { question: 'Asagidaki', options: ['a', 'b', 'c'], answer: 1 } }
    const before = JSON.stringify(row)
    scanQuestion(row)
    expect(JSON.stringify(row)).toBe(before)
  })
})
