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
  it('yakalar: iki harfli Turkce sozcuk de cumle ortasinda buyukse (Codex #524: "en Az")', () => {
    expect(words('Bu niceliğin en Az değeri nedir?')).toEqual(['Az'])
    expect(words('Bunu okudun Mu, hangisi doğrudur?')).toEqual(['Mu'])
  })
  it('yakalamaz: fen icin element sembolu ve sabitler (Mn, Zn, Cu, Kc, Kp); genotip (Aa) her yerde', () => {
    expect(findMidSentenceCapitals('Kc sabiti Mn ve Zn ile Cu arasında; Aa genotipi ve Kp değeri.', { scientific: true })).toEqual([])
    // scientific verilmezse semboller sozcuk gibi ele alinir, genotip yine disarida
    expect(words('Bu tepkimede Mn ve Aa genotipi')).toEqual(['Mn'])
  })
  it('scanQuestion: fen satirinda semboller muaf, turkce satirinda iki harfli sozcuk yakalanir', () => {
    expect(rules({ game: 'fen', category: 'kimya', content: { question: 'Bu tepkimede Mn yükseltgenir, Kc sabiti değişmez.', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('mid_sentence_capital')
    expect(rules({ game: 'turkce', content: { question: 'Bu niceliğin en Az değeri nedir?', options: ['a', 'b', 'c'], answer: 0 } })).toContain('mid_sentence_capital')
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
  it('yakalamaz: "şekilde" = "biçimde" ve konu adi olarak ciplak isim (Codex #523)', () => {
    expect(findMissingFigureReference({ question: 'Öğrenciler aynı sayıda olacak şekilde gruplara ayrılacaktır.' })).toEqual([])
    expect(findMissingFigureReference({ question: 'Grafik okuma becerisi nedir? Harita ölçeği ne işe yarar?' })).toEqual([])
  })
  it('yakalar: gosterici gorsel gondermeleri (yukarıdaki tabloda, grafikte verilen, Şekil 1)', () => {
    expect(findMissingFigureReference({ question: 'Yukarıdaki tabloda verilen değerlere göre' })[0]).toEqual({ field: 'question', term: 'Yukarıdaki tabloda' })
    expect(findMissingFigureReference({ question: 'Grafikte verilen hız-zaman ilişkisi' })).toHaveLength(1)
    expect(findMissingFigureReference({ question: 'Şekil 1 incelendiğinde' })).toHaveLength(1)
  })
  it('yakalar: cekimli govde ile gosterici gondermeler (grafiğe göre, şekle göre, tabloyu inceleyiniz; Codex #524)', () => {
    expect(findMissingFigureReference({ question: 'Aşağıdaki grafiğe göre doğru seçenek hangisidir?' })).toEqual([{ field: 'question', term: 'Aşağıdaki grafiğe' }])
    expect(findMissingFigureReference({ question: 'Şekle göre x kaç derecedir?' })).toEqual([{ field: 'question', term: 'Şekle göre' }])
    expect(findMissingFigureReference({ question: 'Tabloya göre hangisi doğrudur?' })).toHaveLength(1)
    expect(findMissingFigureReference({ question: 'Grafiği inceleyiniz ve cevaplayınız.' })).toHaveLength(1)
    expect(findMissingFigureReference({ question: 'Tablodan yararlanarak ortalamayı bulunuz.' })).toHaveLength(1)
    expect(findMissingFigureReference({ question: 'Resme bakıldığında hangi dönem anlaşılır?' })).toHaveLength(1)
  })
  it('yakalamaz: cekimli govdenin gorsel disi kullanimlari (devreye girmek, şekli beğenmek, resmi kurum)', () => {
    expect(findMissingFigureReference({ question: 'Yeni yasa bugün devreye girdi; resmi kurumlar bu şekli beğendi.' })).toEqual([])
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
  it('yakalamaz: kimyasal formul ve indis (H2O aritmetik baglamda degil; skip verilirse hic bakilmaz)', () => {
    expect(findSuperscriptLoss('H2O ve CO2 molekülleri', { skip: true })).toEqual([])
    expect(findSuperscriptLoss('H2O ve CO2 molekülleri')).toEqual([])
  })
  it('yakalamaz: buyuk harfli formul ve indis aritmetik baglamda da (biyoloji O2 + glikoz, fizik F2 = m a; Codex #524)', () => {
    expect(rules({ game: 'fen', category: 'biyoloji', content: { question: 'Hücrede O2 + glikoz tepkimesi sonucu ne oluşur?', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('superscript_loss')
    expect(rules({ game: 'fen', category: 'fizik', content: { question: 'F2 = m a ise F2 kaç N olur?', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('superscript_loss')
    expect(rules({ game: 'fen', category: 'kimya', content: { question: '2H2 + O2 = 2H2O tepkimesi', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('superscript_loss')
  })
  it('yakalamaz: "1" indisli esi olan degisken indistir (x1 + x2 = 5, Vieta)', () => {
    expect(findSuperscriptLoss('x1 + x2 = 5 ve x1 x2 = 6 ise denklem hangisidir?')).toEqual([])
  })
  it('yakalar: kucuk harfli degisken + rakam aritmetik baglamda, kategori kapisi olmadan (fizik, kimya, matematik)', () => {
    expect(rules({ game: 'fen', category: 'fizik', content: { question: 'x2+y2=1 çemberi', options: ['a', 'b', 'c'], answer: 0 } })).toContain('superscript_loss')
    expect(rules({ game: 'fen', category: 'kimya', content: { question: 'r2 = 4 ise yarıçap', options: ['a', 'b', 'c'], answer: 0 } })).toContain('superscript_loss')
    expect(rules({ game: 'matematik', content: { question: 'x2+y2=1 çemberi', options: ['a', 'b', 'c'], answer: 0 } })).toContain('superscript_loss')
  })
  it('siklardaki ust indis kaybi da taranir (Codex #523)', () => {
    const findings = scanQuestion({ game: 'matematik', category: 'Cebir', content: { question: 'Çemberin denklemi hangisidir?', options: ['x2+y2=1', 'x+y=1', 'xy=1'], answer: 0 } }).findings
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'superscript_loss', field: 'options[0]' })]))
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

describe('Codex #525 follow-ups', () => {
  const words = (s, o) => findMidSentenceCapitals(s, o).map((c) => c.word)
  it('figure: "asagidaki resmi/resmî kurum" gorsel degildir; resim cekimleri yakalanir', () => {
    expect(findMissingFigureReference({ question: 'Aşağıdaki resmî kurumlardan hangisi yasama organıdır?' })).toEqual([])
    expect(findMissingFigureReference({ question: 'Aşağıdaki resmi kurumlardan hangisi yasama organıdır?' })).toEqual([])
    expect(findMissingFigureReference({ question: 'Aşağıdaki resimde hangi dönem görülür?' })).toHaveLength(1)
    expect(findMissingFigureReference({ question: 'Aşağıdaki resimlerden hangisi Selçuklu dönemine aittir?' })).toHaveLength(1)
    expect(findMissingFigureReference({ question: 'Yukarıdaki tabloya göre' })).toHaveLength(1)
    expect(findMissingFigureReference({ question: 'Resme bakıldığında hangi dönem anlaşılır?' })).toHaveLength(1)
  })
  it('superscript: buyuk harfli degisken yakalanir (A2+B2=C2, X2+Y2=1), tek harfli element ve indis atlanir', () => {
    expect(findSuperscriptLoss('A2+B2=C2 ise').map((h) => h.token)).toContain('A2')
    expect(findSuperscriptLoss('X2+Y2=1 çemberi').map((h) => h.token)).toEqual(['X2'])
    expect(findSuperscriptLoss('Hücrede O2 + glikoz tepkimesi')).toEqual([])
    expect(findSuperscriptLoss('F2 = m a ise F2 kaç N olur?')).toEqual([])
    expect(findSuperscriptLoss('E2 = E1 + W ise')).toEqual([])
    expect(findSuperscriptLoss('x2+y2+z2=14').map((h) => h.token)).toEqual(['x2', 'y2', 'z2'])
  })
  it('capital: fen icinde Kf, Ek gibi iki harfli semboller muaf; Turkce iki harfli sozcuk yine yakalanir; fen disinda Kf yakalanir', () => {
    expect(rules({ game: 'fen', category: 'kimya', content: { question: 'Donma noktası alçalması ΔTf = Kf · m ile bulunur; Kf sabiti nedir?', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('mid_sentence_capital')
    expect(rules({ game: 'fen', category: 'fizik', content: { question: 'Cismin kinetik enerjisi Ek = 1/2 m v² olduğuna göre Ek kaç J?', options: ['a', 'b', 'c'], answer: 0 } })).not.toContain('mid_sentence_capital')
    expect(words('Bir elektron Bu yörüngede Ne kadar kalır?', { scientific: true })).toEqual(['Bu'])
    expect(words('Bu tepkimenin Kf değeri nedir?')).toEqual(['Kf'])
  })
  it('capital: ok isaretinden sonraki sozcuk cumle basidir', () => {
    expect(words('Veriler: 3, 5, 7, 5 → Bu veri setinin modu kaçtır?')).toEqual([])
    expect(words('f(x) -> Bu fonksiyon artandır. g => Şu da azalandır.')).toEqual([])
    expect(words('Veriler → Bu veri Ve şu')).toEqual(['Ve'])
  })
})

describe('Codex #527 follow-ups', () => {
  const words = (s, o) => findMidSentenceCapitals(s, o).map((c) => c.word)
  const fig = (q) => findMissingFigureReference({ question: q }).map((f) => f.term)
  const sup = (t) => findSuperscriptLoss(t).map((h) => h.token)
  it('figure: unlu dusmeli resim cekimleri gosterici ile yakalanir (resmin, resme, resmi + fiil); "resmi/resmî kurum" ve "resmen" yakalanmaz', () => {
    expect(fig('Aşağıdaki resmin konusu nedir?')).toEqual(['Aşağıdaki resmin'])
    expect(fig('Aşağıdaki resme ait bilgi hangisidir?')).toEqual(['Aşağıdaki resme'])
    expect(fig('Aşağıdaki resmi kullanarak soruyu cevaplayınız.')).toEqual(['Aşağıdaki resmi'])
    expect(fig('Yukarıdaki resmi inceleyiniz.')).toEqual(['Yukarıdaki resmi'])
    expect(fig('Yukarıdaki resmi hangi ressam yapmıştır?')).toEqual(['Yukarıdaki resmi'])
    expect(fig('Aşağıdaki resminde görülen yapı hangisidir?')).toEqual(['Aşağıdaki resminde'])
    expect(fig('Aşağıdaki resmi kurumlardan hangisi yasama organıdır?')).toEqual([])
    expect(fig('Aşağıdaki resmî kurumlardan hangisi yasama organıdır?')).toEqual([])
    expect(fig('Aşağıdaki resmi belgelerden hangisi geçerlidir?')).toEqual([])
    expect(fig('Aşağıdaki resmi görevlerden hangisi valiye aittir?')).toEqual([])
    expect(fig('Aşağıdaki resmi açıklamalardan hangisi doğrudur?')).toEqual([])
    expect(fig('Aşağıdaki resmi kimlik belgelerinden hangisi geçerlidir?')).toEqual([])
    expect(fig('Aşağıdaki resmi yapılardan hangisi Selçuklu dönemine aittir?')).toEqual([])
    expect(fig('Aşağıdaki resmen tanınan devletlerden hangisi?')).toEqual([])
    expect(fig('Yukarıdaki resmi yapan sanatçı kimdir?')).toEqual(['Yukarıdaki resmi'])
    expect(fig('Yukarıdaki resmi gördüğünüzde ne düşünürsünüz?')).toEqual(['Yukarıdaki resmi'])
  })
  it('capital: fen icinde muafiyet yalniz ASCII sembol bicimi icindir; Turkce harfli (İp, İz, Ön, Üç) ve listeli ASCII (Ev, An) sozcukler yakalanir; Er element sembolu olarak muaf kalir, Kf/Fs/Vo muaf', () => {
    expect(words('Cisim bir İp ile gösterilir.', { scientific: true })).toEqual(['İp'])
    expect(words('Cisim bir İz bırakır.', { scientific: true })).toEqual(['İz'])
    expect(words('Bu cisim Ön tarafa gider.', { scientific: true })).toEqual(['Ön'])
    expect(words('Bu deneyde Üç kap kullanılır.', { scientific: true })).toEqual(['Üç'])
    expect(words('Cisim bir Ev büyüklüğünde ve bir An için durur.', { scientific: true })).toEqual(['Ev', 'An'])
    expect(words('Tepkimenin Kf değeri, kuvvet Fs ve hız Vo verilmiştir.', { scientific: true })).toEqual([])
    expect(words('Cisim bir İp ile gösterilir.', { scientific: false })).toEqual(['İp'])
  })
  it('superscript: buyuk harfli tek indisli nicelik (E2 = 10 J, Q2 = 4 C, R2 = 10 Ω) indistir; harf+rakam komsulu (A2+B2=C2, X2+Y2=1) ve kucuk harf (x2 = 9) ust indis kaybidir', () => {
    expect(sup('E2 = 10 J ise son enerji kaçtır?')).toEqual([])
    expect(sup('Q2 = 4 C olur')).toEqual([])
    expect(sup('R2 = 10 Ω ise eşdeğer direnç kaçtır?')).toEqual([])
    expect(sup('Sistemin toplam enerjisi E2 kaç J olur?')).toEqual([])
    expect(sup('A2+B2=C2 ise')).toContain('A2')
    expect(sup('X2+Y2=1 çemberi')).toEqual(['X2'])
    expect(sup('A2 = B2 + C2 ise')).toContain('A2')
    expect(sup('x2 = 9 ise x kaçtır?')).toEqual(['x2'])
    expect(sup('E1 = 5 J ve E2 = 10 J ise')).toEqual([])
  })
})

describe('Codex #531 follow-ups', () => {
  const words = (s, o) => findMidSentenceCapitals(s, o).map((c) => c.word)
  const sup = (t) => findSuperscriptLoss(t).map((h) => h.token)
  it('capital: fen icinde yalniz indis bicimiyle cakisan sozcukler (Us, Un, Ur, Ut) muaftir; An, Ol, Oy gibi Turkce sozcukler yakalanir', () => {
    expect(words('Deneyden bir An sonra sıcaklık artar.', { scientific: true })).toEqual(['An'])
    expect(words('Cisim bir Ol dedi.', { scientific: true })).toEqual(['Ol'])
    expect(words('Bu soruda Oy verildi.', { scientific: true })).toEqual(['Oy'])
    expect(words('Devrede ölçülen Us gerilimi nedir?', { scientific: true })).toEqual([])
    expect(words('Kaynağın Un ve Ur değerleri verilmiştir.', { scientific: true })).toEqual([])
  })
  it('superscript: cagri parantezi gruplama degildir (f(A2) = D2 bayraklanmaz); gruplama parantezi komsu sayilir', () => {
    expect(sup('f(A2) = D2')).toEqual([])
    expect(sup('f(A2) = 3')).toEqual([])
    expect(sup('g(X2) + h(D2) = 1')).toEqual([])
    expect(sup('A2 = f(D2)')).toEqual([])
    expect(sup('(A2) + (D2) = 9')).toEqual(['A2', 'D2'])
    expect(sup('A2 + (D2) = 9')).toEqual(['A2', 'D2'])
    expect(sup('f(A2 + D2) = 1')).toEqual(['A2', 'D2'])
  })
  it('superscript: bosluklu parantez yalniz aritmetik baglamda gruplamadir; onunde herhangi bir sozcuk varsa cagri/duz metin sayilir', () => {
    expect(sup('f (A2) = D2')).toEqual([])
    expect(sup('sin (A2) = D2')).toEqual([])
    expect(sup('F (A2) = D2')).toEqual([])
    expect(sup('p (A2) = D2')).toEqual([])
    expect(sup('log (A2) + ln (D2) = 1')).toEqual([])
    expect(sup('Buna göre (A2) + (D2) = 9')).toEqual([])
    expect(sup('2 (A2) + D2 = 9')).toEqual([])
    expect(sup('(A2) + (D2) = 9')).toEqual(['A2', 'D2'])
    expect(sup('A2 + (D2) = 9')).toEqual(['A2', 'D2'])
    expect(sup('X = (A2) + (D2)')).toEqual(['A2', 'D2'])
  })
  it("superscript: gruplama olumlu tanimlidir; turev/ters fonksiyon isaretli cagri gruplama degildir, tekli isaretli grup komsudur", () => {
    expect(sup("f'(A2) = D2")).toEqual([])
    expect(sup('f′(A2) = D2')).toEqual([])
    expect(sup('f^{-1}(A2) = D2')).toEqual([])
    expect(sup('A2 - (-D2) = 0')).toEqual(['A2', 'D2'])
    expect(sup('A2 + (+D2) = 0')).toEqual(['A2', 'D2'])
    expect(sup('(-A2) + D2 = 0')).toEqual(['A2', 'D2'])
  })
})

describe('Codex #529 follow-ups', () => {
  const words = (s, o) => findMidSentenceCapitals(s, o).map((c) => c.word)
  const fig = (q) => findMissingFigureReference({ question: q }).map((f) => f.term)
  const sup = (t) => findSuperscriptLoss(t).map((h) => h.token)
  it('superscript: parantezli buyuk harfli komsu da aritmetik komsudur (A2 + (D2), (A2) + (B2))', () => {
    expect(sup('A2 + (D2) = 9')).toEqual(['A2', 'D2'])
    expect(sup('(A2) + (B2) = C2')).toContain('A2')
    expect(sup('A2 + D2 = 9')).toEqual(['A2', 'D2'])
    expect(sup('f(A2) = 3')).toEqual([])
    expect(sup('E2 = (10 J)')).toEqual([])
  })
  it('figure: "resmi" sonrasi fiil ekleri dort unlu uyumuyla eslesir (görünce, gördüğünde, yaptığında); "resmi görev" yine sifattir', () => {
    expect(fig('Aşağıdaki resmi görünce ne düşünürsünüz?')).toEqual(['Aşağıdaki resmi'])
    expect(fig('Yukarıdaki resmi gördüğünde ne hissedersin?')).toEqual(['Yukarıdaki resmi'])
    expect(fig('Yukarıdaki resmi yaptığında kaç yaşındaydı?')).toEqual(['Yukarıdaki resmi'])
    expect(fig('Aşağıdaki resmi kullanınca ne olur?')).toEqual(['Aşağıdaki resmi'])
    expect(fig('Aşağıdaki resmi gordugunuzde ne dusunursunuz?')).toEqual(['Aşağıdaki resmi'])
    expect(fig('Aşağıdaki resmi görev alanı hangisidir?')).toEqual([])
    expect(fig('Aşağıdaki resmi görüş bildiren kurum hangisidir?')).toEqual([])
  })
  it('capital: duzlesmis indis bicimiyle cakisan ASCII sozcukler (Us, Un, Ur, Ut) fen icinde sembol sayilir; fen disinda yakalanir', () => {
    expect(words('Devrede ölçülen Us gerilimi nedir?', { scientific: true })).toEqual([])
    expect(words('Kaynağın Un ve Ur değerleri verilmiştir.', { scientific: true })).toEqual([])
    expect(words('Devrede ölçülen Us gerilimi nedir?', { scientific: false })).toEqual(['Us'])
    expect(words('Cisim bir Ev büyüklüğündedir.', { scientific: true })).toEqual(['Ev'])
  })
})
