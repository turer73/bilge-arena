#!/usr/bin/env node
/**
 * Deterministik soru metni kusur taramasi
 * ============================================================================
 * Antigravity Pilot 1-3 ve kullanici ekran goruntusu ayni kusur ailesini
 * gosterdi: Turkce karakter kaybi ("gelisimi", "asagidakilerden"), cumle
 * ortasinda buyuk harf ("en Büyük okyanusudur" -> Pasifik'in es adi sizar),
 * kokte "sekildeki gibi" deyip gorsel tasimayan soru, dogru sikkin acik ara en
 * uzun secenek olmasi ve kokle kelime ortusmesi, ust indis kaybi ("x2+y2").
 * Bunlarin hicbiri LLM gerektirmez; 50 soru basina 250 model gorevinden once
 * ve daha ucuza yakalanmalidir. docs/question-quality-system.md'deki
 * "deterministik kontroller LLM'e gitmeden reddeder" katmaninin yeridir.
 *
 * validate-question-bank.mjs ile ILISKI: o betik data/soru-bankasi/ altindaki
 * JSON dosyalarini (mojibake, sik sayisi, solution<->answer) tarar. Bu betik
 * CANLI yayimlanmis revizyonlari (question_content_revisions) tarar ve
 * yalniz burada listelenen metin/olcme kusurlarina bakar; mojibake orada
 * kaldi, burada tekrarlanmaz.
 *
 * YETKI SINIRI: Bu betik yalniz OKUR ve yalniz RAPOR yazar. Hicbir bulgu
 * karar degildir: yayin, karantina ve ret insan yonetisim RPC'lerinde kalir.
 * Betik DB'ye yazmaz, is_active/answer/content'e dokunmaz.
 *
 * Kullanim:
 *   npm run scan:question-text                        # yayimli revizyonlar, rapor stdout
 *   npm run scan:question-text -- --json out.json     # JSON rapor dosyaya
 *   npm run scan:question-text -- --game turkce --limit 500
 *   npm run scan:question-text -- --input secure/antigravity-input-pilot2.json
 *                                                     # DB yerine export dosyasi
 * Vitest: import { scanQuestion, scanRevisions } from '.../scan-question-text-defects.mjs'
 *
 * Cikis kodu: her zaman 0. Bu bir kapi degil, envanterdir; kapi olacaksa
 * bulgu siniflari ayri ayri validate-question-bank veya basic guard'a tasinir.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Kural 1: Turkce karakter kaybi ───────────────────────────────────────────
// Yalniz ASCII'lesmis halde gorulen, Turkce'de yalniz diakritikli yazilan
// govdeler. Liste kisa ve kesin tutuldu: "sik" (sık) veya "bir" gibi ASCII
// halde de sozcuk olan govdeler FP uretecegi icin BILEREK DISARIDA.
// Her giris: ASCII govde -> duzgun yazim (rapor icin). Sozcuk siniri regex ile.
const ASCII_DIACRITIC_STEMS = [
  ['asagidaki', 'aşağıdaki'], ['asagida', 'aşağıda'], ['yukaridaki', 'yukarıdaki'],
  ['hangisidir', null], // ASCII hali de gecerli; yalniz "asagidakilerden hangisi" ile birlikte anlamli, tek basina sayilmaz
  ['dogru', 'doğru'], ['yanlis', 'yanlış'], ['degil', 'değil'], ['degildir', 'değildir'],
  ['gelisim', 'gelişim'], ['gelismis', 'gelişmiş'], ['gelismislik', 'gelişmişlik'],
  ['yukseklik', 'yükseklik'], ['yuksek', 'yüksek'], ['uzunlugu', 'uzunluğu'],
  ['olculmez', 'ölçülmez'], ['olcut', 'ölçüt'], ['olcum', 'ölçüm'],
  ['gunluk', 'günlük'], ['gunumuz', 'günümüz'], ['bugun', 'bugün'],
  ['yararlandigi', 'yararlandığı'], ['kolaylik', 'kolaylık'], ['kolaylikla', 'kolaylıkla'],
  ['kulturel', 'kültürel'], ['kultur', 'kültür'], ['sosyal hizmetlerin niteliginden', 'sosyal hizmetlerin niteliğinden'],
  ['niteligi', 'niteliği'], ['niteliginden', 'niteliğinden'],
  ['dusmek', 'düşmek'], ['dustugu', 'düştüğü'], ['dusunce', 'düşünce'], ['dusun', 'düşün'],
  ['buyuk', 'büyük'], ['kucuk', 'küçük'], ['ucgen', 'üçgen'], ['ucte', 'üçte'],
  ['dunya', 'dünya'], ['dunyanin', 'dünyanın'], ['yuzey', 'yüzey'], ['yuzeyinin', 'yüzeyinin'],
  ['sirada', 'sırada'], ['sinif', 'sınıf'], ['sinav', 'sınav'], ['ogrenci', 'öğrenci'],
  ['ogretmen', 'öğretmen'], ['ogren', 'öğren'], ['cozum', 'çözüm'], ['cozumu', 'çözümü'],
  ['soru koku', 'soru kökü'], ['secenek', 'seçenek'], ['sik', null],
  ['yaklasik', 'yaklaşık'], ['iliski', 'ilişki'], ['gorulur', 'görülür'], ['gorulen', 'görülen'],
  ['gore', 'göre'], ['ozellik', 'özellik'], ['ozgun', 'özgün'], ['uretim', 'üretim'],
  ['ulke', 'ülke'], ['sehir', 'şehir'], ['kisi', 'kişi'], ['insan odakli', 'insan odaklı'],
  ['odakli', 'odaklı'], ['fiziksel altyapidan', 'fiziksel altyapıdan'], ['altyapi', 'altyapı'],
  ['once', 'önce'], ['sonra', null], ['icin', 'için'], ['ile birlikte', null],
  ['catisma', 'çatışma'], ['degisim', 'değişim'], ['degisken', 'değişken'],
  ['isik', 'ışık'], ['isi', null], ['sicaklik', 'sıcaklık'], ['basinc', 'basınç'],
  ['carpim', 'çarpım'], ['bolum', 'bölüm'], ['toplami', 'toplamı'], ['kacinci', 'kaçıncı'],
  ['kac', null], ['kacdir', 'kaçtır'], ['esittir', 'eşittir'], ['esit', 'eşit'],
].filter(([, fixed]) => fixed !== null) // null = tek basina belirsiz, listeden dus

const STEM_RE = new RegExp(
  '(?<![\\p{L}])(' + ASCII_DIACRITIC_STEMS.map(([s]) => s.replace(/ /g, '\\s+')).join('|') + ')(?=[\\p{L}]*)(?![\\p{L}]*[çğıöşüÇĞİÖŞÜ])',
  'giu',
)

// Turkce karakter orani: metinde hic Turkce'ye ozgu harf yoksa ve metin yeterince
// uzunsa, karakter kaybi olasi. Kisa metin (sik) icin oran anlamsiz, uygulanmaz.
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/
const MIN_LEN_FOR_RATIO = 80

export function findAsciiDiacriticLoss(text) {
  if (!text) return []
  const hits = new Map()
  for (const m of String(text).matchAll(STEM_RE)) {
    const stem = m[1].toLowerCase().replace(/\s+/g, ' ')
    const fixed = ASCII_DIACRITIC_STEMS.find(([s]) => s === stem)?.[1] ?? null
    hits.set(stem, fixed)
  }
  return [...hits].map(([ascii, fixed]) => ({ ascii, fixed }))
}

// ── Kural 2: Cumle ortasinda buyuk harf ──────────────────────────────────────
// "Bir kentin Gerçek gelişmişliği", "en Büyük okyanusudur". Ozel ad/kisaltma
// FP'sini sinirlamak icin: (a) tamamen buyuk harfli tokenlar (TYT, DNA) sayilmaz,
// (b) cumle basi (nokta/soru/unlem/iki nokta/tirnak sonrasi) sayilmaz,
// (c) sayi/roma rakami/tek harf sayilmaz, (d) bilinen ozel ad listesi
// (ay, gun, ulke, kurum) kaba filtre ile disarida tutulur.
const KNOWN_PROPER = new Set([
  'türkiye', 'türk', 'osmanlı', 'anadolu', 'avrupa', 'asya', 'afrika', 'amerika', 'akdeniz', 'karadeniz', 'ege', 'marmara',
  'istanbul', 'ankara', 'izmir', 'atatürk', 'mustafa', 'kemal', 'cumhuriyet', 'meb', 'ösym', 'yks', 'tyt', 'ayt', 'lgs', 'ydt',
  'ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık',
  'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi', 'pazar',
  'dünya', 'güneş', 'ay', 'mars', 'jüpiter', 'venüs', 'satürn', 'merkür', 'neptün', 'uranüs', 'plüton',
  'pasifik', 'atlas', 'hint', 'arktik', 'himalaya', 'everest', 'nil', 'amazon', 'fırat', 'dicle', 'kızılırmak', 'sakarya',
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'k', 'm', 'n', 'p', 'r', 't',
  'newton', 'einstein', 'darwin', 'mendel', 'durkheim', 'weber', 'marx', 'platon', 'aristoteles', 'sokrates', 'descartes', 'kant',
  'allah', 'tanrı', 'kur', 'kuran', 'incil', 'tevrat', 'hz', 'peygamber',
])
const SENTENCE_START = /(^|[.!?:…"“”'‘’(\[\n]\s*|\b(?:I{1,3}|IV|V)\.\s+)$/

export function findMidSentenceCapitals(text, { locale = 'tr' } = {}) {
  if (!text) return []
  const s = String(text)
  const out = []
  // En az uc harf: iki harfli buyuk-kucuk tokenlar element sembolu (Mn, Zn,
  // Cu), genotip (Aa) veya sabit (Kc, Kp) olup fen sorularinda yaygindir.
  const re = /(?<![\p{L}\p{N}'’])([A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,})(?![\p{L}])/gu
  for (const m of s.matchAll(re)) {
    const word = m[1]
    const before = s.slice(0, m.index)
    if (SENTENCE_START.test(before)) continue
    const lower = word.toLocaleLowerCase(locale)
    if (KNOWN_PROPER.has(lower)) continue
    // Cok kelimeli ozel ad: "İstanbul Boğazı", "Pasifik Okyanusu", "Türkiye
    // Cumhuriyeti". Bir onceki sozcuk de buyuk harfle basliyorsa bu sozcuk o
    // adin devamidir. "en Büyük okyanusudur" yakalanmaya devam eder: oncesi "en".
    if (/(?:^|\s)[A-ZÇĞİÖŞÜ][\p{L}]*\s+$/u.test(before)) continue
    // Ingilizce icerik (WordQuest) icin "I" ve ozel ad yogunlugu farkli; orada
    // yalniz Turkce kokte anlamli. Cagiran locale='en' verirse kuraldan cik.
    if (locale === 'en') continue
    out.push({ word, index: m.index })
  }
  return out
}

// ── Kural 3: Gorsel referansi ama gorsel yok ─────────────────────────────────
// QuestionContent tipinde gorsel alani YOK (src/types/database.ts). Dolayisiyla
// kokte sekle/grafige/tabloya gonderme varsa soru cevaplanamaz durumdadir.
// Pilot 1 Q21 tam olarak buydu (3 kor cozucu + adversarial inconclusive).
// Yalniz GOSTERICI gorsel gondermeleri: "sekildeki", "yukaridaki tabloda",
// "grafikte verilen". Ciplak isim ("sekilde" = "bicimde", "grafik nedir?")
// konu anlatimidir, gorsel gondermesi degil; ERROR uretmemeli.
const FIGURE_NOUN = '(?:şekil|sekil|grafik|tablo|resim|görsel|gorsel|diyagram|harita|çizim|cizim|figür|figur|devre)'
const FIGURE_RE = new RegExp(
  '(?<![\\p{L}])(?:'
  + FIGURE_NOUN + '(?:deki|daki|teki|taki)'                                      // şekildeki, tablodaki, grafikteki
  + '|(?:yukarıdaki|yukaridaki|aşağıdaki|asagidaki|verilen|yandaki)\\s+' + FIGURE_NOUN + '[\\p{L}]*' // yukarıdaki şekilde
  + '|' + FIGURE_NOUN + '(?:de|da|te|ta)\\s+(?:gösterilen|gosterilen|verilen|görülen|gorulen)'   // şekilde gösterilen
  + '|şekil\\s*\\d|sekil\\s*\\d|tablo\\s*\\d|grafik\\s*\\d'                          // Şekil 1, Tablo 2
  + '|ok yönünde|ok yonunde|devre şeması|devre semasi'
  + '|in the (?:figure|table|diagram|chart|picture) (?:below|above)|shown below|image below|figure \\d)'
  + '(?![\\p{L}])',
  'iu',
)

export function findMissingFigureReference(content) {
  const fields = ['question', 'passage', 'context', 'sentence']
  const hits = []
  for (const f of fields) {
    const v = content?.[f]
    if (typeof v !== 'string') continue
    const m = v.match(FIGURE_RE)
    if (m) hits.push({ field: f, term: m[0] })
  }
  const hasMedia = ['image', 'imageUrl', 'image_url', 'media', 'figure', 'svg', 'diagram', 'assets']
    .some((k) => content && content[k] != null && content[k] !== '')
  return hasMedia ? [] : hits
}

// ── Kural 4: Dogru sik acik ara en uzun ve kokle ortusuyor ───────────────────
// Klasik madde yazimi kurali: dogru cevap secenekler icinde bariz sekilde daha
// uzunsa ("longest-option cue") test-wise ogrenci okumadan bulur. Esik: dogru
// sik, ikinci en uzun sikkin >= 1.6 kati VE en az 25 karakter. Kok-ortusme:
// dogru sikkin >=4 harfli sozcuklerinin en az %60'i kokte de geciyor VE bu
// oran diger siklarin ortalamasinin 2 katindan buyuk ("stem-echo cue").
const STOP_TR = new Set(['için', 'ile', 'olan', 'olarak', 'gibi', 'daha', 'çok', 'bir', 'bu', 'şu', 'o', 've', 'veya', 'ama', 'fakat', 'ancak', 'yani', 'sonra', 'önce', 'kadar', 'göre', 'her', 'hangi', 'nedir', 'hangisi', 'değil', 'olur', 'olmaz', 'ise', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'were'])
function words(s) {
  return String(s ?? '').toLocaleLowerCase('tr').match(/[\p{L}]{4,}/gu)?.filter((w) => !STOP_TR.has(w)) ?? []
}
function stemEcho(option, stemWords) {
  const ow = words(option)
  if (ow.length === 0) return 0
  const hit = ow.filter((w) => stemWords.has(w)).length
  return hit / ow.length
}

export function findAnswerCues(content) {
  const options = Array.isArray(content?.options) ? content.options.map((o) => String(o ?? '')) : []
  const answer = content?.answer
  if (options.length < 3 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return []
  const out = []
  const lens = options.map((o) => o.trim().length)
  const correctLen = lens[answer]
  const others = lens.filter((_, i) => i !== answer).sort((a, b) => b - a)
  if (correctLen >= 25 && others[0] > 0 && correctLen >= 1.6 * others[0]) {
    out.push({ cue: 'longest_option', correctLen, nextLen: others[0] })
  }
  const stemWords = new Set(words([content.question, content.passage, content.context, content.sentence].filter(Boolean).join(' ')))
  if (stemWords.size >= 6) {
    const echo = options.map((o) => stemEcho(o, stemWords))
    const correctEcho = echo[answer]
    const otherAvg = echo.filter((_, i) => i !== answer).reduce((a, b) => a + b, 0) / (options.length - 1)
    if (correctEcho >= 0.6 && correctEcho > 2 * otherAvg && words(options[answer]).length >= 3) {
      out.push({ cue: 'stem_echo', correctEcho: +correctEcho.toFixed(2), otherAvg: +otherAvg.toFixed(2) })
    }
  }
  return out
}

// ── Kural 5: Ust indis / matematik dizgi kaybi ───────────────────────────────
// "x2+y2+z2=14" (x²+y²+z²), "10 3" (10³). Yalniz harf+rakam bitisik VE aritmetik
// baglam (+, -, =, ^ komsulugu) varsa; "H2O", "CO2" gibi formuller ve "x1, x2"
// indisleri FP olacagi icin fen/kimya kategorisinde uygulanmaz, cagiran gecer.
const SUPERSCRIPT_LOSS_RE = /(?<![\p{L}\p{N}])([a-zA-Z])([2-9])(?=\s*[+\-=*/)]|\s*$)/gu

export function findSuperscriptLoss(text, { skip = false } = {}) {
  if (skip || !text) return []
  const out = []
  for (const m of String(text).matchAll(SUPERSCRIPT_LOSS_RE)) out.push({ token: m[0], index: m.index })
  return out
}

// ── Tek soru icin tum kurallar ───────────────────────────────────────────────
export function scanQuestion(row) {
  const content = row.content ?? {}
  const game = String(row.game ?? '')
  const isEnglish = game === 'wordquest'
  // Yalniz kimyada (O2 + H2 -> H2O gibi tepkimeler) ust indis kurali atlanir;
  // fizik ve biyoloji x2+y2 gibi matematiksel ifade tasiyabilir.
  const isChemistry = String(row.category ?? '').toLocaleLowerCase('tr') === 'kimya'
  const textFields = ['question', 'passage', 'context', 'sentence', 'solution', 'explanation', 'hint']
  const findings = []

  for (const f of textFields) {
    const v = content[f]
    if (typeof v !== 'string' || !v.trim()) continue
    if (!isEnglish) {
      const loss = findAsciiDiacriticLoss(v)
      if (loss.length) findings.push({ rule: 'ascii_diacritic_loss', field: f, severity: 'error', detail: loss })
      if (v.length >= MIN_LEN_FOR_RATIO && !TR_LETTERS.test(v)) {
        findings.push({ rule: 'no_turkish_letters', field: f, severity: 'warn', detail: { length: v.length } })
      }
    }
    const caps = findMidSentenceCapitals(v, { locale: isEnglish ? 'en' : 'tr' })
    if (caps.length) findings.push({ rule: 'mid_sentence_capital', field: f, severity: 'warn', detail: caps.map((c) => c.word) })
    const sup = findSuperscriptLoss(v, { skip: isChemistry || isEnglish })
    if (sup.length) findings.push({ rule: 'superscript_loss', field: f, severity: 'warn', detail: sup.map((s) => s.token) })
  }
  if (Array.isArray(content.options)) {
    content.options.forEach((o, i) => {
      if (typeof o !== 'string') return
      if (!isEnglish) {
        const loss = findAsciiDiacriticLoss(o)
        if (loss.length) findings.push({ rule: 'ascii_diacritic_loss', field: `options[${i}]`, severity: 'error', detail: loss })
      }
      const sup = findSuperscriptLoss(o, { skip: isChemistry || isEnglish })
      if (sup.length) findings.push({ rule: 'superscript_loss', field: `options[${i}]`, severity: 'warn', detail: sup.map((s) => s.token) })
    })
  }
  const fig = findMissingFigureReference(content)
  if (fig.length) findings.push({ rule: 'figure_reference_without_media', field: fig[0].field, severity: 'error', detail: fig })
  const cues = findAnswerCues(content)
  for (const c of cues) findings.push({ rule: c.cue, field: 'options', severity: 'warn', detail: c })

  return {
    questionId: row.id ?? row.question_id ?? null,
    revisionId: row.revision_id ?? row.published_revision_id ?? null,
    game,
    category: row.category ?? null,
    examRef: row.exam_ref ?? null,
    findings,
  }
}

export function scanRevisions(rows) {
  const results = rows.map(scanQuestion).filter((r) => r.findings.length > 0)
  const byRule = {}
  for (const r of results) for (const f of r.findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1
  const byGame = {}
  for (const r of results) byGame[r.game] = (byGame[r.game] ?? 0) + 1
  return { scanned: rows.length, flagged: results.length, byRule, byGame, results }
}

// ── Girdi: DB (yayimli revizyonlar) veya export dosyasi ───────────────────────
async function loadFromDb({ game, limit }) {
  const root = join(__dirname, '..')
  const envPath = join(root, '.env.local')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
    }
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok — .env.local kontrol et.')
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let q = sb.from('question_content_revisions')
      .select('id, question_id, game, category, subcategory, exam_ref, difficulty, content')
      .eq('status', 'published')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (game) q = q.eq('game', game)
    const { data, error } = await q
    if (error) throw new Error(`supabase: ${error.message}`)
    for (const r of data ?? []) rows.push({ ...r, revision_id: r.id, id: r.question_id })
    if (!data || data.length < PAGE || (limit && rows.length >= limit)) break
  }
  return limit ? rows.slice(0, limit) : rows
}

function loadFromFile(path) {
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  const arr = Array.isArray(raw) ? raw : (raw.rows || raw.items || raw.questions || Object.values(raw).find(Array.isArray) || [])
  return arr.map((r) => ({ ...r, revision_id: r.revision_id ?? r.published_revision_id ?? r.revisionId ?? null, id: r.id ?? r.questionId ?? r.question_id }))
}

function printReport(report) {
  console.log(`Taranan: ${report.scanned}  Bayrakli: ${report.flagged}`)
  console.log('Kural bazinda:', JSON.stringify(report.byRule))
  console.log('Ders bazinda:', JSON.stringify(report.byGame))
  const order = { error: 0, warn: 1 }
  const sorted = [...report.results].sort((a, b) => {
    const sa = Math.min(...a.findings.map((f) => order[f.severity])); const sb = Math.min(...b.findings.map((f) => order[f.severity]))
    return sa - sb || b.findings.length - a.findings.length
  })
  for (const r of sorted.slice(0, 200)) {
    console.log(`\n[${r.game}/${r.category ?? '-'}] q=${r.questionId} rev=${r.revisionId ?? '-'}`)
    for (const f of r.findings) console.log(`  ${f.severity.toUpperCase().padEnd(5)} ${f.rule.padEnd(32)} ${f.field.padEnd(12)} ${JSON.stringify(f.detail)}`)
  }
  if (sorted.length > 200) console.log(`\n... ve ${sorted.length - 200} soru daha (--json ile tamamini al)`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
  const input = opt('--input')
  const game = opt('--game')
  const limit = opt('--limit') ? Number(opt('--limit')) : null
  const jsonOut = argv.includes('--json') ? (opt('--json') && !opt('--json').startsWith('--') ? opt('--json') : '-') : null
  const rows = input ? loadFromFile(input) : await loadFromDb({ game, limit })
  const report = scanRevisions(rows)
  if (jsonOut === '-') console.log(JSON.stringify(report, null, 2))
  else if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(report, null, 2)); console.log(`JSON rapor yazildi: ${jsonOut}`); printReport(report) }
  else printReport(report)
}
