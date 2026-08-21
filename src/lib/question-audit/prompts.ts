/**
 * Prompt ureticileri — saf fonksiyonlar, IO yok.
 *
 * Kor ajanlarin prompt'lari YALNIZ `BlindQuestionView` alir. `QuestionDraft`'i
 * kabul etmezler; bu, cevap anahtarinin prompt'a sizmasini imzada engeller.
 * Garanti `__tests__/blind-view.test.ts` icindeki sizinti testiyle kilitlenir.
 *
 * PROMPT_VERSION: her anlamli degisiklikte artar ve her kosu kaydina yazilir.
 * Onsuz bir verdict degisiminin sorudan mi prompt'tan mi geldigi bilinemez.
 */

import type { BlindQuestionView } from './blind-view'
import type { QuestionDraft } from './types'

export const PROMPT_VERSION = {
  blindSolver: 'blind-solver@1',
  adversarial: 'adversarial@1',
  // @2: `terse` tanimi soru turune baglandi. @1'de model UZUNLUGU olcuyordu,
  // YETERLILIGI degil: 200 soruluk kalibrasyonda 64/200 (%32) terse geldi ve
  // ornekler incelendiginde tanim/hatirlama sorulari cikti — "Tree = agac.",
  // "'-mali/-meli' gereklilik kipi ekidir." Bunlarda gosterilecek ara adim YOK,
  // tek cumle zaten tam cevap. Hatta adimlari tam gosteren bir cografya cozumu
  // ("1:100.000 -> 1 cm = 1 km. 2 cm = 2 km.") sirf kisa oldugu icin terse
  // isaretlenmisti.
  solutionVerifier: 'solution-verifier@2',
} as const

const LETTERS = 'ABCDEFGH'

/** Sik listesini sik SAYISINA gore uretir — 4 (LGS) ve 5 (TYT/AYT) ayni kodla. */
function renderOptions(options: readonly string[]): string {
  return options.map((o, i) => `${i} (${LETTERS[i] ?? '?'}): ${o}`).join('\n')
}

function renderContext(v: BlindQuestionView): string {
  const passage = v.passage
    ? `Oncul/tablo/veri (ogrenciye soru kokunden ONCE gosterilir):\n${v.passage}\n\n`
    : ''
  const topic = v.topic ? ` | Konu: ${v.topic}` : ''
  return `${passage}Sinav: ${v.examRef} | Ders: ${v.subject}${topic}

Soru:
${v.questionText}

Secenekler (${v.options.length} adet):
${renderOptions(v.options)}`
}

/**
 * JSON-only talimati.
 *
 * `reasoning`'in ONCE yazilmasini prompt'ta ZORLUYORUZ. Gemini'da bunu
 * `propertyOrdering` ile sema duzeyinde sabitleyebilirsin; DeepSeek/OpenAI
 * uyumlu provider'larda oyle bir alan YOK — `json_object` yalniz gecerli JSON
 * garanti eder, alan sirasini degil. Sira bozulursa model once karari verip
 * sonra gerekce uydurur; yani Chain-of-Thought'un tam tersi olur ve bu SESSIZCE
 * gerceklesir (cikti gecerli, testler yesil, dogruluk dusuk).
 */
function jsonOnly(fields: string[]): string {
  return `Yanitin YALNIZ su alanlari tasiyan tek bir JSON nesnesi olsun, baska metin veya markdown YOK:
${fields.map((f) => `  ${f}`).join('\n')}

ALAN SIRASI ZORUNLU: "reasoning" alanini HER ZAMAN once yaz. Once dusun, sonra karar ver.`
}

// ── 1. Kor Cozucu ──────────────────────────────────────────────────────────

export function buildBlindSolverPrompt(v: BlindQuestionView): { system: string; user: string } {
  const maxIdx = v.options.length - 1
  return {
    system: `Sen ${v.examRef} seviyesinde ${v.subject} sorularini cozen bir uzmansin.
Sana bir soru ve secenekleri verilecek. Soruyu bagimsiz olarak coz.

Onemli: cozumun bir secenege denk gelmiyorsa bunu durustce bildir. Zorlama
eslestirme yapma — en yakin sikki secmek, hatali bir soruyu gizler.

${jsonOnly([
      '"reasoning": <string — adim adim cozum>',
      `"predictedAnswerIndex": <integer 0-${maxIdx}, veya hicbir sikla eslesmiyorsa null>`,
      '"computedValue": <string — buldugun ham sonuc (or. "61", "2 mol"), yoksa null>',
    ])}`,
    user: renderContext(v),
  }
}

// ── 2. Adversarial ─────────────────────────────────────────────────────────

export function buildAdversarialPrompt(v: BlindQuestionView): { system: string; user: string } {
  return {
    system: `Sen bir sinav sorusu inceleme komisyonu uyesisin. Gorevin, bu soruya
yapilacak bir itirazin komisyondan GECIP GECMEYECEGINI degerlendirmektir.

Kalibrasyon: gercek sinav komisyonlarinda itirazlarin ezici cogunlugu REDDEDILIR.
Sorularin cogu saglamdir. Kusur bulamamak basarili bir denetimdir, yenilgi degil.
Yalniz komisyonu ikna edebilecek, somut ve gosterilebilir kusurlari bildir.
Uslup/tercih meselelerini, "daha iyi yazilabilirdi" turu yorumlari bildirme.

Arayacagin kusurlar YALNIZ sunlar:
- MULTIPLE_CORRECT: iki veya daha fazla secenek teknik olarak dogru kabul
  edilebilir. Hangi secenekler oldugunu optionIndexes'te MUTLAKA belirt;
  belirtemiyorsan bu kusuru bildirme.
- MISSING_PREMISE: sorunun cozulebilmesi icin gerekli ama verilmemis bir kosul
  var (or. "x tam sayidir" denmemis ve sonuc buna bagli).
- AMBIGUOUS_WORDING: ifade iki farkli okumaya izin veriyor ve bu okumalar FARKLI
  siklara goturuyor. Sadece "biraz mugah" yeterli degil.

Cevap anahtarini gormuyorsun; hangi sikkin dogru sayildigini bilmiyorsun.
Kusur yoksa findings bos dizi olsun.

${jsonOnly([
      '"reasoning": <string — hangi acilari denedin, neden gectiler/kaldilar>',
      '"findings": <dizi; her eleman {"code": "MULTIPLE_CORRECT"|"MISSING_PREMISE"|"AMBIGUOUS_WORDING", "evidence": string, "optionIndexes"?: integer[]}>',
    ])}`,
    user: renderContext(v),
  }
}

// ── 3. Cozum Denetcisi ─────────────────────────────────────────────────────

/**
 * Tek ajan ki isaretli cevabi ve cozumu gorur.
 *
 * KRITIK: modele "cozum isaretli cevabi destekliyor mu?" DIYE SORMUYORUZ. O
 * yonlendirici bir sorudur ve bu ajan zaten anahtari gordugu icin sycophancy'ye
 * en acik olanidir — mevcut production judge'inin basarisiz oldugu tam kurulum.
 * Bunun yerine cozumun HANGI SIKKA VARDIGINI cikartiyoruz; karsilastirmayi
 * `deriveVerdict` kodda yapiyor. Boylece celiski bir model gorusu degil,
 * hesaplanmis bir olgu oluyor.
 *
 * Bu nedenle prompt isaretli cevabi ne soyler ne ima eder.
 */
export function buildSolutionVerifierPrompt(draft: QuestionDraft): { system: string; user: string } {
  const maxIdx = draft.options.length - 1
  const solution = (draft.solutionText ?? '').trim()
  if (!solution) {
    throw new Error('buildSolutionVerifierPrompt: cozum metni bos — ajan atlanmali (skipped)')
  }
  const passage = draft.passage ? `Oncul/veri:\n${draft.passage}\n\n` : ''

  return {
    system: `Sen bir editoryal tutarlilik denetcisisin. Sana bir soru, secenekleri
ve yazarin yazdigi cozum metni verilecek.

Gorevin TEK sey: cozum metninin kendi ic mantigiyla HANGI SECENEGE vardigini
belirlemek. Cozumun dogru olup olmadigini tartisma; soruyu kendin cozme.
Yalniz "bu metin nereye variyor?" sorusunu yanitla.

Cozum bir secenege varmiyorsa (or. sonucu siklarda yok, ya da hic sonuc
sunmuyorsa) solutionConcludesIndex = null.

Ayrica cozumun yeterliligini siniflandir. Olcu UZUNLUK DEGIL, sorunun
TURUNE gore yeterlilik:

- "adequate": cozum, o sorunun gerektirdigi kadarini veriyor.
  Tanim, kelime anlami, deyim, ek/kural bilgisi gibi HATIRLAMA sorularinda
  TEK CUMLE yeterlidir ve "adequate" sayilir — gosterilecek ara adim yoktur.
  Hesap gerektiren sorularda da adimlar kisa yazilmissa ama sonuca goturuyorsa
  "adequate"tir. Ornek: "1:100.000 -> 1 cm = 1 km. 2 cm = 2 km." TAMDIR.

- "terse": soru BIRDEN COK ADIMLI bir turetme/hesap gerektiriyor, fakat cozum
  yalnizca nihai sonucu bildiriyor ve ara adimlarin hicbirini gostermiyor.
  Ornek: "Cevap 42'dir." (nasil bulundugu yok)

Suphede kalirsan "adequate" sec. Kisa olmasi tek basina kusur DEGILDIR.

${jsonOnly([
      '"reasoning": <string — cozum metnini takip ederek nereye vardigi>',
      `"solutionConcludesIndex": <integer 0-${maxIdx}, veya hicbir secenege varmiyorsa null>`,
      '"solutionCompleteness": "adequate" | "terse"',
    ])}`,
    user: `${passage}Soru:
${draft.questionText}

Secenekler (${draft.options.length} adet):
${renderOptions(draft.options)}

Yazarin cozum metni:
"""
${solution}
"""`,
  }
}
