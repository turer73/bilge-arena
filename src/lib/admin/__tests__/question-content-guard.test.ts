import { describe, expect, it } from 'vitest'
import {
  buildSubjectPromptAppendix,
  createTdkGuard,
  validateGeneratedQuestionContent,
} from '../question-content-guard.mjs'

const tdkGuard = createTdkGuard([
  ['Hazirlik', 'Hazırlık'],
  ['hazirlik', 'hazırlık'],
  ['dogru', 'doğru'],
])

describe('question-content-guard', () => {
  it('TDK ASCII ihlali olan Turkce soruyu reddeder', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Hazirlik sürecinde ilk olarak hangi adım uygulanmalıdır?',
      options: ['Plan yapmak', 'Sonucu açıklamak', 'Raporu silmek', 'Yanıtı saklamak', 'Soruyu atlamak'],
      answer: 0,
      solution: 'Hazırlık sürecinde önce plan yapılır.',
    }, { game: 'turkce', tdkGuard })

    expect(err).toMatch(/TDK ASCII ihlali/)
  })

  it('onculleri options alanina bolen soruyu yakalar', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Bir cismin kinetik enerjisiyle ilgili hangileri doğrudur?',
      options: [
        'I. Cismin kütlesine bağlıdır',
        'II. Hızının karesi ile orantılıdır',
        'III. Vektörel bir büyüklüktür',
        'I ve II',
        'II ve III',
      ],
      answer: 3,
      solution: 'Kinetik enerji kütleye ve hızın karesine bağlıdır; vektörel değildir.',
    }, { game: 'fen', tdkGuard })

    expect(err).toBe('Öncüller seçeneklere bölünemez')
  })

  it('Roma rakamli tarih adlarini false-positive olarak reddetmez', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Osmanlı Devleti hangi savaş sonrasında Balkanlarda önemli toprak kaybetmiştir?',
      options: [
        'I. Balkan Savaşı',
        'Trablusgarp Savaşı',
        'Karlofça Antlaşması',
        'II. Viyana Kuşatması',
        'Prut Savaşı',
      ],
      answer: 0,
      solution: 'I. Balkan Savaşı sonucunda Osmanlı Devleti Balkanlarda önemli toprak kaybetmiştir.',
    }, { game: 'sosyal', tdkGuard })

    expect(err).toBeNull()
  })

  it('coklu-roman iceren KARSILASTIRMA sikkini FP olarak reddetmez (I. X, II. Y)', () => {
    // Gecerli YKS formati: tek sikta hem I hem II var = karsilastirma-cevabi,
    // oncul-bolunmesi DEGIL. Guard bunu broken saymamali.
    const err = validateGeneratedQuestionContent({
      question: 'İki cümle arasındaki anlam ilişkisi açısından nasıl bir bağlantı vardır?',
      options: [
        'I. neden-sonuç, II. amaç-sonuç',
        'I. neden-sonuç, II. neden-sonuç',
        'I. amaç-sonuç, II. koşul-sonuç',
        'I. eş anlamlı, II. zıt anlamlı',
        'I. benzerlik, II. karşıtlık',
      ],
      answer: 0,
      solution: 'Birinci cümlede neden-sonuç, ikincisinde amaç-sonuç ilişkisi vardır.',
    }, { game: 'turkce', tdkGuard })

    expect(err).toBeNull()
  })

  it('UZUN Roma-adli sik (kombinasyon-cevapsiz) FP olarak reddedilmez (Codex #261)', () => {
    // Tarihi-ad şıkları: her şık uzun roman-adı, AMA kombinasyon-cevabı ("I ve II") YOK
    // = ad-listesi, öncül-bölünmesi değil.
    const err = validateGeneratedQuestionContent({
      question: 'Osmanlı modernleşmesiyle ilgili aşağıdakilerden hangisi meclisin açılmasını sağlamıştır?',
      options: [
        'I. Meşrutiyet’in ilanı ve Kanun-ı Esasi’nin kabul edilmesi süreci',
        'II. Meşrutiyet’in ilanıyla meclisin yeniden açılması ve İttihat Terakki etkisi',
        'Tanzimat Fermanı’nın ilan edilmesi ve gayrimüslim haklarının genişletilmesi',
        'Islahat Fermanı’nın yürürlüğe girmesi ve eşitlik ilkesinin benimsenmesi',
        'Sened-i İttifak ile ayanların siyasi güç kazanması ve merkezin zayıflaması',
      ],
      answer: 1,
      solution: 'II. Meşrutiyet’in ilanı Kanun-ı Esasi’yi yeniden yürürlüğe koyarak meclisi açmıştır.',
    }, { game: 'sosyal', tdkGuard })

    expect(err).toBeNull()
  })

  it('yasakli catch-all sik (Hicbiri) iceren soruyu reddeder', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Fe₂O₃ + 3CO → 2Fe + 3CO₂ tepkimesinde hangi madde yükseltgenir?',
      options: ['Fe₂O₃', 'CO', 'Fe', 'CO₂', 'Hiçbiri'],
      answer: 1,
      solution: 'CO içindeki karbon +2 değerlikten +4 değerliğe yükseltgenir.',
    }, { game: 'fen', tdkGuard })

    expect(err).toBe('Yasaklı şık içeriyor')
  })

  it('Turkce buyuk-harf/noktalamali catch-all (HİÇBİRİ, Hiçbiri.) reddedilir (Codex #261)', () => {
    for (const catchAll of ['HİÇBİRİ', 'Hiçbiri.', 'HEPSİ', 'Hepsi']) {
      const err = validateGeneratedQuestionContent({
        question: 'Bu deney sorusunda hangi sonuç beklenir burada?',
        options: ['Seçenek bir', 'Seçenek iki', 'Seçenek üç', 'Seçenek dört', catchAll],
        answer: 0,
        solution: 'Birinci seçenek doğru sonuçtur bu deneyde.',
      }, { game: 'fen', tdkGuard })
      expect(err, `catch-all: ${catchAll}`).toBe('Yasaklı şık içeriyor')
    }
  })

  it('parantezli Roma etiketli oncul-bolunmesini yakalar (I) ... II) ...) (Codex #261)', () => {
    const err = validateGeneratedQuestionContent({
      question: 'Bir cismin kinetik enerjisiyle ilgili hangileri doğrudur?',
      options: [
        'I) Cismin kütlesine bağlıdır',
        'II) Hızının karesi ile orantılıdır',
        'III) Vektörel bir büyüklüktür',
        'I ve II',
        'II ve III',
      ],
      answer: 3,
      solution: 'Kinetik enerji kütleye ve hızın karesine bağlıdır; vektörel değildir.',
    }, { game: 'fen', tdkGuard })

    expect(err).toBe('Öncüller seçeneklere bölünemez')
  })

  it('prompt appendix tek ortak kaynaktan oyun bazli altin ornek verir', () => {
    expect(buildSubjectPromptAppendix('matematik')).toContain('ALTIN KURAL')
    expect(buildSubjectPromptAppendix('matematik')).toContain('ALTIN ÖRNEK')
    expect(buildSubjectPromptAppendix('bilinmeyen')).toBe('')
  })

  it('2026 YKS stil-referansi tum YKS-derslerinin promptuna girer', () => {
    // Few-shot: 2026 gerçek-sınav stili tüm YKS derslerine eklenir (mat/fen 149-soru
    // katalog analiziyle ölçüldü; görsel-şekil boyutu hariç aktarılabilir).
    for (const game of ['turkce', 'sosyal', 'wordquest', 'matematik', 'fen']) {
      expect(buildSubjectPromptAppendix(game)).toContain('2026')
    }
    // Bilinmeyen oyun 2026-stil almaz
    expect(buildSubjectPromptAppendix('bilinmeyen')).not.toContain('2026')
  })
})
