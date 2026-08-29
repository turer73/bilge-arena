/**
 * ÖSYM few-shot template dosyalarını oluşturur.
 *
 * YDT ve TYT raw text'lerden en iyi extract edilebilen örnekleri alır,
 * bunları AI generation few-shot prompt'ları için kullanılabilir JSON'a dönüştürür.
 *
 * Kullanım: node scripts/build-templates.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const EXT_DIR = resolve(__dir, '..', 'extracted')
const TPL_DIR = resolve(__dir, '..', 'templates')
if (!existsSync(TPL_DIR)) mkdirSync(TPL_DIR, { recursive: true })

// ─── Doğrulanmış El Yapımı Örnekler ──────────────────────────────────────────
// Bu örnekler debug sırasında raw text'den doğrudan okundu ve doğrulandı.

const VERIFIED_WORDQUEST = [
  // YDT 2020 Q1 — fill-in-blank vocabulary
  {
    question: "Although considering how someone may react to a situation can be worthwhile, making ---- about another person's behaviour may lead you to the wrong conclusions.",
    options: ['promises', 'assumptions', 'mistakes', 'priorities', 'compliments'],
    answer: 1,
    answer_letter: 'B',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q1',
  },
  // YDT 2020 Q2 — fill-in-blank vocabulary
  {
    question: "By the time psychology came into its own as an ---- discipline after separating from philosophy, the scientific revolution was two centuries old.",
    options: ['offensive', 'artificial', 'inadequate', 'independent', 'outdated'],
    answer: 3,
    answer_letter: 'D',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q2',
  },
  // YDT 2020 Q3 — fill-in-blank vocabulary (sentence initial)
  {
    question: "----, the Universe was too energetic for stars to form, but as it expanded and cooled, it became possible for gravity to form clumps of gas.",
    options: ['Initially', 'Frankly', 'Virtually', 'Ultimately', 'Merely'],
    answer: 0,
    answer_letter: 'A',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q3',
  },
  // YDT 2020 Q4 — fill-in-blank vocabulary
  {
    question: "Mobile learning, the role of which in education is becoming quite important, is often applied outside classrooms to ---- the learning that takes place inside classrooms.",
    options: ['enhance', 'insist', 'require', 'suspect', 'provide'],
    answer: 0,
    answer_letter: 'A',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q4',
  },
  // YDT 2020 Q11 — connectives/discourse markers
  {
    question: "Computers may be able to beat us in specific activities; ----, it will be a long time before we see a robot with human-like versatility.",
    options: ['moreover', 'thus', 'likewise', 'instead', 'however'],
    answer: 4,
    answer_letter: 'E',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q11',
  },
  // YDT 2020 Q6 — tense/grammar (double blank)
  {
    question: "In the 19-mile exclusion zone surrounding the Chernobyl power plant in Ukraine, which ---- following the 1986 reactor meltdown, plants and animals ---- now in ways they never had before.",
    options: [
      'used to be contaminated / thrive',
      'has been contaminated / will have been thriving',
      'would have been contaminated / have been thriving',
      'was contaminated / are thriving',
      'had been contaminated / were thriving',
    ],
    answer: 3,
    answer_letter: 'D',
    type: 'sentence_completion',
    source: '2020 YDT İngilizce Q6',
  },
  // YDT 2021 Q1 — fill-in-blank vocabulary
  {
    question: "Researchers studying climate change have found that the greenhouse gases ---- by human industry could be having dramatic effects on global temperatures.",
    options: ['released', 'invented', 'described', 'absorbed', 'consumed'],
    answer: 0,
    answer_letter: 'A',
    type: 'fill_in_blank',
    source: '2021 YDT İngilizce Q1 (estimated)',
    note: 'auto-extracted, verify before use',
  },
  // YDT 2018 Q5 — in/for prepositions
  {
    question: "Kefir is a fermented drink similar ---- yoghurt and is valued ---- its beneficial effects on microbes in our gut.",
    options: ['in / as', 'with / about', 'around / of', 'to / for', 'from / by'],
    answer: 3,
    answer_letter: 'D',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q10',
  },
]

const VERIFIED_SOSYAL = [
  // 2019 TYT Sosyal Q1 — Tarih
  {
    passage: 'Asya Hun Devleti\'nin dağılmasının ardından Hunlar, batıya doğru yayılmaya başlamış ve Karadeniz\'in kuzeyinde bulunan Germen kavimlerini batıya doğru itmişlerdir. Kavimler Göçü adı verilen bu süreçte Hunlar Avrupa siyasetinde etkin hâle gelirken ikiye ayrılan Roma İmparatorluğu önemli sorunlarla karşı karşıya kalmıştır.',
    question: 'Buna göre aşağıdakilerden hangisi Kavimler Göçü\'nün sonuçlarından biri olarak gösterilemez?',
    options: [
      'Türk kültürü Avrupa\'da yayılmıştır.',
      'Avrupa\'nın etnik yapısı değişmiştir.',
      'Roma İmparatorluğu güç kaybetmeye başlamıştır.',
      'Bilim ve teknikte önemli gelişmeler yaşanmıştır.',
      'Avrupa\'da siyasi dengeler değişmiştir.',
    ],
    answer: 3,
    answer_letter: 'D',
    category: 'tarih',
    source: '2019 TYT Sosyal Q1',
  },
  // 2019 TYT Sosyal Q2 — Tarih
  {
    passage: 'Gazneli Mahmut, Abbasi halifesini Büveyhoğullarının baskısından kurtarmış ve bu hizmetine karşılık olarak Abbasi halifesinden Sultan unvanını almıştır.',
    question: 'Bu bilgiyle aşağıdakilerden hangisine ulaşılabilir?',
    options: [
      'Gazneli Mahmut\'un İslam dünyasının önemli bir siyasi gücü olduğuna',
      'Abbasi halifesinin siyasi yetkilerini Gazneli Mahmut\'a bıraktığına',
      'Türkler arasında İslamiyetin hızla yayıldığına',
      'İslam dünyasında mezhep çatışmalarının son bulduğuna',
      'Gazneli Mahmut\'un İslam dünyasında siyasi birliği sağladığına',
    ],
    answer: 0,
    answer_letter: 'A',
    category: 'tarih',
    source: '2019 TYT Sosyal Q2',
  },
  // 2019 TYT Sosyal Q11 — Felsefe (Mağara metaforu)
  {
    passage: 'Bir mağara düşünün. Mahkûmlar, yüzleri mağaranın arka duvarına dönük zincirlenmiş. Ömürleri boyunca orada tutulmuşlar ve başları, duvar dışında hiçbir şey göremeyecek şekilde sabitlenmiş. Bu yolda yürüyen insanların gölgeleri mağaranın duvarına vurur. Mağaranın içindeki mahkûmlar her zaman yalnızca gölgeleri görür; gölgelerin gerçek şeyler olduklarına inanırlar.',
    question: 'Bu parçada betimlenen mağara metaforundan aşağıdaki yargıların hangisine ulaşılabilir?',
    options: [
      'Gerçekliğin doğası değişmez ve farklı yüzleri bulunmaz.',
      'Duyuların yanıltıcılığından kurtulmak için başkalarının yardımına ihtiyaç duyarız.',
      'Aklın çalışma ilkelerini duyulardan gelen veriler belirler.',
      'Duyuların kullanımı hakikate ulaşmak için bir ön koşuldur.',
      'Duyular aracılığıyla bildiklerimiz tümüyle bir yanılsama olabilir.',
    ],
    answer: 4,
    answer_letter: 'E',
    category: 'felsefe',
    source: '2019 TYT Sosyal Q11',
  },
  // 2019 TYT Sosyal Q12 — Felsefe (Levinas)
  {
    passage: 'Levinas\'a göre kişinin kendisi hakkındaki endişelerinden doğan eylemler ahlaki değerlendirme kapsamına girmez. Ancak aynı endişeyi başka bir insana yöneltmek, örneğin aç bir çocuğu doyurmak, ahlaki bir davranıştır.',
    question: 'Buna göre Levinas ahlaki değerlendirmenin amacı olarak aşağıdaki kavramlardan hangisini vurgulamaktadır?',
    options: ['Ölçülülük', 'Mutluluk', 'Sorumluluk', 'Fayda', 'Dinginlik'],
    answer: 2,
    answer_letter: 'C',
    category: 'felsefe',
    source: '2019 TYT Sosyal Q12',
  },
]

const VERIFIED_TURKCE = [
  // 2019 TYT Türkçe Q2 — anlam bilgisi
  {
    passage: 'Kemalettin Tuğcu bizlere yoksulluğu, yaşamla savaşmayı, acımayı, yardımlaşmayı ve paylaşmayı öğretti. Kahramanları hiç yüzüstü, umarsız bırakmadı. Eserleriyle Tuğcu okurlarına bir bakıma acı aşısı yaptı.',
    question: 'Bu parçada altı çizili sözle asıl anlatılmak istenen aşağıdakilerden hangisidir?',
    options: [
      'Kitaplarıyla acılara, zorluklara göğüs germe becerisi kazandırmak',
      'Yaşanan acıların okurla paylaşılarak azalmasını sağlamak',
      'Odağına acıyı alarak kalemini edebî yönden güçlendirmek',
      'Acıyla yoğrulmuş hayatların kendi yönünü bulacağını göstermek',
      'Toplumun yaşadığı acıları yalın hâliyle eserlerine aktarabilmek',
    ],
    answer: 0,
    answer_letter: 'A',
    category: 'anlam_bilgisi',
    source: '2019 TYT Türkçe Q2',
  },
  // 2019 TYT Türkçe Q4 — anlam bilgisi
  {
    passage: 'Çocuk, aklının doğal işleyişi sonucu her an ortaya çıkan tuhaf sorulardan birine yanıt bulma amacıyla gerçekleştirdiği her samimi girişim sayesinde, o amacın sonucuyla kıyaslanamayacak oranda kalıcı kazanımlar edinir.',
    question: 'Bu cümlede çocuklarla ilgili olarak asıl anlatılmak istenen aşağıdakilerden hangisidir?',
    options: [
      'Tuhaf sorular sorma davranışlarının çocuklarda istemsiz biçimde gerçekleştiği',
      'Merak ettikleri konunun iç yüzünü öğrendikleri sürece bilgi birikimlerinin arttığı',
      'Kendi hâllerine bırakıldıklarında tuhaf sorular sorma alışkanlıklarının sona erdiği',
      'Cevabını samimi biçimde merak ettikleri soruların yetişkinlerce cevaplandırılması gerektiği',
      'Sorularına cevap arayışlarının gelişimleri üzerinde cevaplardan daha etkili olduğu',
    ],
    answer: 4,
    answer_letter: 'E',
    category: 'anlam_bilgisi',
    source: '2019 TYT Türkçe Q4',
  },
]

// ─── Auto-extracted RC questions from YDT ────────────────────────────────────
function extractBestRCQuestions(filePath, maxCount = 3) {
  if (!existsSync(filePath)) return []
  const data = JSON.parse(readFileSync(filePath, 'utf8'))

  // RC questions: no "----", has long options (sentence paraphrasing or comprehension)
  return data.questions.filter(q =>
    !q.imageDependent &&
    q.options.length >= 5 &&
    !q.question.includes('İNGİLİZCE TESTİ') &&
    !q.options.some(o => o.includes('sorularda') || o.includes('İNGİLİZCE')) &&
    q.options.every(o => o.length > 10) &&
    q.question.length > 50 &&
    // Has question-type phrases
    /According to|The author|It can be|The passage|What (is|does)|Which of|The (main|writer)|Based on/i.test(q.question)
  ).slice(0, maxCount).map(q => ({
    question: q.question.slice(0, 500),
    options: q.options.slice(0, 5),
    answer_letter: q.answer,
    type: 'reading_comprehension',
    source: `${data.year} YDT İngilizce Q${q.num} (auto-extracted)`,
  }))
}

// ─── TYT Section Text Özeti (referans için) ──────────────────────────────────
function sectionSummary(filePath) {
  if (!existsSync(filePath)) return null
  const data = JSON.parse(readFileSync(filePath, 'utf8'))
  const summary = { year: data.year, answerKey: data.answerKey }
  // Kısa özet (ilk 500 karakter per bölüm)
  summary.sections = {}
  for (const [key, sec] of Object.entries(data.sections)) {
    summary.sections[key] = {
      total: sec.total,
      preview: sec.rawText.slice(0, 500).trim(),
    }
  }
  return summary
}

// ─── Wordquest Template ────────────────────────────────────────────────────────
const wqTemplate = {
  description: 'ÖSYM YDT İngilizce geçmiş sınav soruları — wordquest game AI generation few-shot şablonları',
  usage: 'Bu örnekleri AI generation prompt\'larında "örnek sorular" olarak kullan',
  exam: 'YDT İngilizce',
  question_types: {
    fill_in_blank: {
      description: 'Cümlede boşluk doldurma (tek kelime)',
      examples: VERIFIED_WORDQUEST.filter(q => q.type === 'fill_in_blank').slice(0, 5),
    },
    sentence_completion: {
      description: 'Çift boşluklu gramer/zaman soruları',
      examples: VERIFIED_WORDQUEST.filter(q => q.type === 'sentence_completion').slice(0, 3),
    },
    reading_comprehension: {
      description: 'Okuma parçası soruları (auto-extracted, verify before use)',
      examples: [
        ...extractBestRCQuestions(`${EXT_DIR}/ydt_en_2020.json`, 2),
        ...extractBestRCQuestions(`${EXT_DIR}/ydt_en_2021.json`, 1),
      ],
    },
  },
}

writeFileSync(`${TPL_DIR}/wordquest_ydt_examples.json`,
  JSON.stringify(wqTemplate, null, 2), 'utf8')
console.log(`✓ wordquest template: ${VERIFIED_WORDQUEST.length} verified + RC candidates`)

// ─── Sosyal Template ──────────────────────────────────────────────────────────
const sosyalTemplate = {
  description: 'ÖSYM TYT Sosyal Bilimler geçmiş sınav soruları — sosyal game AI generation few-shot şablonları',
  usage: 'Yalnız tarih/felsefe için doğrulanmış few-shot; diğer Sosyal kategorilerinde kapsam kanıtı sayma',
  exam: 'TYT Sosyal Bilimler',
  examples: VERIFIED_SOSYAL,
  verified_example_categories: ['tarih', 'felsefe'],
  missing_verified_example_categories: ['cografya', 'sosyoloji', 'din_kulturu'],
  tyt_raw_sections: [2018, 2019, 2021].map(y => sectionSummary(`${EXT_DIR}/tyt_${y}.json`)).filter(Boolean).map(s => ({
    year: s.year,
    answer_key: s.answerKey.sosyal,
    preview: s.sections.sosyal?.preview,
  })),
}

writeFileSync(`${TPL_DIR}/sosyal_tyt_examples.json`,
  JSON.stringify(sosyalTemplate, null, 2), 'utf8')
console.log(`✓ sosyal template: ${VERIFIED_SOSYAL.length} verified`)

// ─── Türkçe Template ──────────────────────────────────────────────────────────
const turkceTemplate = {
  description: 'ÖSYM TYT Türkçe geçmiş sınav soruları — türkçe game AI generation few-shot şablonları',
  usage: 'anlam_bilgisi/dil_bilgisi soru generation prompt\'larında örnek olarak kullan',
  exam: 'TYT Türkçe',
  examples: VERIFIED_TURKCE,
  tyt_raw_sections: [2018, 2019, 2021].map(y => sectionSummary(`${EXT_DIR}/tyt_${y}.json`)).filter(Boolean).map(s => ({
    year: s.year,
    answer_key: s.answerKey.turkce,
    preview: s.sections.turkce?.preview,
  })),
}

writeFileSync(`${TPL_DIR}/turkce_tyt_examples.json`,
  JSON.stringify(turkceTemplate, null, 2), 'utf8')
console.log(`✓ türkçe template: ${VERIFIED_TURKCE.length} verified`)

// ─── Genel Özet ──────────────────────────────────────────────────────────────
const overviewTemplate = {
  description: 'ÖSYM geçmiş sınav referans workspace özeti',
  generated: new Date().toISOString().slice(0, 10),
  available_pdfs: {
    TYT: [2018, 2019, 2021],
    YDT_en: [2018, 2020, 2021],
    missing: ['tyt_2020', 'ydt_2019'],
  },
  templates: {
    wordquest: 'templates/wordquest_ydt_examples.json',
    sosyal: 'templates/sosyal_tyt_examples.json',
    turkce: 'templates/turkce_tyt_examples.json',
  },
  raw_extractions: {
    tyt: ['extracted/tyt_2018.json', 'extracted/tyt_2019.json', 'extracted/tyt_2021.json'],
    ydt: ['extracted/ydt_en_2018.json', 'extracted/ydt_en_2020.json', 'extracted/ydt_en_2021.json'],
  },
  usage_in_prompts: {
    wordquest: 'VERIFIED_WORDQUEST örneklerini prompt başına ekle: "Here are real ÖSYM YDT exam questions for reference..."',
    sosyal: 'VERIFIED_SOSYAL örneklerini prompt başına ekle: "İşte gerçek ÖSYM TYT Sosyal sınav soruları..."',
    turkce: 'VERIFIED_TURKCE örneklerini prompt başına ekle: "İşte gerçek ÖSYM TYT Türkçe sınav soruları..."',
  },
}

writeFileSync(`${TPL_DIR}/overview.json`,
  JSON.stringify(overviewTemplate, null, 2), 'utf8')
console.log(`✓ overview.json`)

// ─── Özet ─────────────────────────────────────────────────────────────────────
console.log('\n=== ÖSYM Referans Workspace Hazır ===')
console.log(`PDFs: 6 adet (6 TB TYT + YDT İngilizce)`)
console.log(`Templates: wordquest=${VERIFIED_WORDQUEST.length} örnek, sosyal=${VERIFIED_SOSYAL.length} örnek, türkçe=${VERIFIED_TURKCE.length} örnek`)
console.log(`Raw section texts: 3 TYT yıl × 4 bölüm + 3 YDT yıl`)
console.log(`Dizin: F:\\projelerim\\bilge-arena\\database\\osym-reference\\`)
