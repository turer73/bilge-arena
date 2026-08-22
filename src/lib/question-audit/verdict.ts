/**
 * Verdict turetme — SAF fonksiyon, IO yok.
 *
 * NEDEN AYRI VE SAF:
 *   Karar agaci `executeAudit` icinde IO ile ic ice olursa, esik degistiginde
 *   gecmisi yeniden puanlayamazsin. Ham ajan ciktilarini sakla + verdict'i
 *   turet dersen, politika degisimi GERIYE DONUK uygulanir ve tek kurus
 *   harcanmaz. Bu, denetim maliyetinin buyuk kismini kurtarir.
 *
 * ONCELIK SIRASI:  REJECTED > INCONCLUSIVE > NEEDS_REVIEW > APPROVED
 *
 *   REJECTED ustte: elde POZITIF kanit varsa (blocking bulgu), bir baska
 *   ajanin arizalanmis olmasi bu kaniti gecersiz kilmaz.
 *   INCONCLUSIVE, NEEDS_REVIEW'un ustunde: yeniden kosmak insan zamanindan
 *   ucuzdur ve eksik ajan blocking bilgi ekleyebilir. Once tekrar kos, sonra
 *   insana goturme karari ver.
 */

import {
  severityOf,
  type AgentOutcome,
  type AuditRun,
  type BlindSolverPayload,
  type Finding,
  type VerdictResult,
} from './types'

/** Gecerli orneklerden cogunluk indeksi. Beraberlik veya cogunluk yoksa null. */
function consensus(indexes: readonly (number | null)[]): { index: number | null; ratio: number } | null {
  if (indexes.length === 0) return null
  const counts = new Map<number | string, number>()
  for (const i of indexes) {
    const key = i === null ? 'NULL' : i
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let bestKey: number | string | null = null
  let bestCount = 0
  let tie = false
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestKey = k
      bestCount = c
      tie = false
    } else if (c === bestCount) {
      tie = true
    }
  }
  // Beraberlik = mutabakat yok. Tek ornekte tie olusamaz.
  if (bestKey === null || tie) return null
  return { index: bestKey === 'NULL' ? null : (bestKey as number), ratio: bestCount / indexes.length }
}

export interface DeriveOptions {
  /**
   * Kor cozucu mutabakati bunun altindaysa bulgu URETILMEZ; soru
   * NEEDS_REVIEW'a duser. Turkce paragraf / sosyoloji gibi kategorilerde
   * tek-ornek uyusmazligi yaygindir; tek stokastik ornekle soru reddetmek
   * yuksek FP uretir.
   */
  minBlindAgreement: number
}

/**
 * 2/3 cogunluk (0.66), 3/3 birlik (1.0) DEGIL.
 *
 * OLCUM (2026-08-21, 146 soruluk kararsiz altkume, ayni model/prompt, her
 * kurulum iki kez kosuldu; tekrarlanabilirlik = iki kosuda ayni sorunun
 * isaretlenmesi):
 *
 *   3 ornek + esik 1.0    42/43 isaret, 19 ortak -> %29
 *   3 ornek + esik 0.66   84/89 isaret, 65 ortak -> %60   <- secilen
 *   5 ornek + esik 1.0    30/25 isaret, 18 ortak -> %49
 *   5 ornek + esik 0.66   60/49 isaret, 38 ortak -> %54
 *
 * Esik, ornek sayisindan daha guclu kaldirac: 3+0.66 kurulumu 5+1.0'i geciyor
 * ve %40 daha ucuz. 5 ornek + katı birlik ayrica SINYALI BASTIRIYOR (isaret
 * 42 -> 30), cunku 5/5 birlik nadir.
 *
 * Tam banka verisinde (4434 soru) esigi 1.0 -> 0.66 indirmenin etkisi:
 *   - kor cozucu bulgusu tekrarlanabilirligi %38 -> %55
 *   - bloklayan (iki-ajan) sinyal 6-7 adaydan 10 adaya cikiyor
 *   - elle adjudike edilen 6 dogrulanmis hatanin TAMAMI iki kosuda da
 *     yakalaniyor (esik 1.0'da bir kosuda ee84140f kaciyordu)
 *   - yeni 4 adayin 1'i gercek hata cikti (ca76ec70 geometri: cevre 52,
 *     alan 126,75 fakat isaretli 117 -- cozum metni bile "126,75 ~ 127"
 *     deyip yarida kesiliyor), 3'u yanlis pozitif
 *
 * Yani kesinlik ~%100'den ~%70'e duserken bir gercek hata daha bulunuyor.
 * 4434 soruluk bankada toplam aday sayisi 10 oldugu icin insan hepsini zaten
 * inceliyor; bu hacimde kacirmamak, kesinlikten degerli.
 */
export const DEFAULT_DERIVE_OPTIONS: DeriveOptions = { minBlindAgreement: 2 / 3 }

export function deriveVerdict(run: AuditRun, opts: DeriveOptions = DEFAULT_DERIVE_OPTIONS): VerdictResult {
  const findings: Finding[] = []
  let inconclusive = false
  const notes: string[] = []

  // ── Kor Cozucu ───────────────────────────────────────────────────────────
  const blindOk = run.blind.filter(
    (o): o is Extract<AgentOutcome<BlindSolverPayload>, { status: 'ok' }> => o.status === 'ok',
  )
  const blindAttempted = run.blind.filter((o) => o.status !== 'skipped').length

  let blindConsensusIndex: number | null = null
  let blindAgreementRatio: number | null = null
  let computedValue: string | null = null

  if (blindOk.length === 0) {
    inconclusive = true
    notes.push(blindAttempted > 0 ? 'kor cozucu tum orneklerde arizali' : 'kor cozucu kosmadi')
  } else {
    const c = consensus(blindOk.map((o) => o.data.predictedAnswerIndex))
    if (c === null) {
      // Ornekler bolundu: sik sirasi degisince cevap kayiyor olabilir
      // (pozisyon yanliligi) ya da soru gercekten belirsiz. Ikisi de insan isi.
      blindAgreementRatio = 0
      notes.push('kor cozucu ornekleri uzlasmadi')
    } else {
      blindConsensusIndex = c.index
      blindAgreementRatio = c.ratio

      if (c.ratio < opts.minBlindAgreement) {
        notes.push(`kor cozucu mutabakati dusuk (${(c.ratio * 100).toFixed(0)}%)`)
      } else if (c.index === null) {
        // computedValue kaniti insan incelemesini hizlandirir; ancak degeri
        // model urettigi icin tek basina deterministik dogrulama SAYILMAZ.
        computedValue = blindOk.find((o) => o.data.computedValue)?.data.computedValue ?? null
        findings.push({
          code: 'NO_CORRECT_OPTION',
          evidence: computedValue
            ? `cozucunun buldugu deger hicbir sikla eslesmiyor: ${computedValue}`
            : 'cozucu bir sonuca vardi ama hicbir sikla eslestiremedi',
        })
      } else if (c.index !== run.markedAnswerIndex) {
        findings.push({
          code: 'WRONG_KEY_SUSPECTED',
          evidence: `kor cozucu ${c.ratio * blindOk.length}/${blindOk.length} ornekte idx${c.index} buldu, isaretli cevap idx${run.markedAnswerIndex}`,
          optionIndexes: [c.index, run.markedAnswerIndex],
        })
      }
    }
  }

  // ── Adversarial ──────────────────────────────────────────────────────────
  if (run.adversarial.status === 'ok') {
    findings.push(...run.adversarial.data.findings)
  } else if (run.adversarial.status === 'failed') {
    inconclusive = true
    notes.push(`adversarial arizali (${run.adversarial.error.kind})`)
  } else {
    notes.push(`adversarial atlandi: ${run.adversarial.reason}`)
  }

  // ── Cozum Denetcisi ──────────────────────────────────────────────────────
  // Karsilastirmayi BURASI yapar, model degil.
  if (run.verifier.status === 'ok') {
    const { solutionConcludesIndex, solutionCompleteness } = run.verifier.data
    if (solutionConcludesIndex !== null && solutionConcludesIndex !== run.markedAnswerIndex) {
      findings.push({
        code: 'SOLUTION_CONTRADICTS_ANSWER',
        evidence: `cozum metni idx${solutionConcludesIndex}'e variyor, isaretli cevap idx${run.markedAnswerIndex}`,
        optionIndexes: [solutionConcludesIndex, run.markedAnswerIndex],
      })
    }
    if (solutionCompleteness === 'terse') {
      findings.push({
        code: 'INCOMPLETE_SOLUTION',
        evidence: 'cozum metni sonuca goturen adimlari icermiyor',
      })
    }
  } else if (run.verifier.status === 'failed') {
    inconclusive = true
    notes.push(`cozum denetcisi arizali (${run.verifier.error.kind})`)
  } else {
    // Cozum metni yok — bu bir ICERIK kusuru degil, YAYIN POLITIKASI sorusu.
    // Deterministik kapinin isi; LLM'e sordurup soru reddettirmiyoruz.
    notes.push(`cozum denetcisi atlandi: ${run.verifier.reason}`)
  }

  // ── Dogrulama kurali (corroboration) ─────────────────────────────────────
  //
  // WRONG_KEY_SUSPECTED tek basina YETERSIZ. 4434 soruluk tam banka kosusunda
  // olculdu:
  //   - kor cozucu + cozum denetcisi AYNI ANDA celiski bildirdi  -> 6/6 dogru
  //   - yalniz kor cozucu                                        -> 10 ornekte
  //     5 kesin yanlis pozitif (Osmanli 1299'u 14.yy sandi; "gordugume"
  //     fiilimsisini gormedi; izohips ozelligini ters okudu; cozumun "I.
  //     Yanlis" dedigi ifadeyi dogru sandi)
  //
  // Yani kor cozucu tek basina bir TANIK, iki tanik gerekiyor. Sorunun KENDI
  // cozum metni bagimsiz ikinci taniktir: yazarin hesabi anahtardan farkli bir
  // sikka cikiyorsa, bu modelin gorusu degil metnin ic celiskisidir.
  const wrongKey = findings.find((f) => f.code === 'WRONG_KEY_SUSPECTED')
  const solutionContradicts = findings.find((f) => f.code === 'SOLUTION_CONTRADICTS_ANSWER')
  // Iki ajan yalniz "anahtar yanlis" dememeli; AYNI alternatif sikka varmis
  // olmali. Aksi halde iki uyusmaz gorus yanlis bir guven sinyali uretir.
  const corroboratedAnswerMismatch = wrongKey !== undefined
    && solutionContradicts !== undefined
    && wrongKey.optionIndexes?.[0] === solutionContradicts.optionIndexes?.[0]
  const uncorroboratedWrongKey = wrongKey !== undefined && !corroboratedAnswerMismatch
  const uncorroboratedSolution = solutionContradicts !== undefined && !corroboratedAnswerMismatch

  // AYNI ILKE, NO_CORRECT_OPTION icin. Tam banka kosusunda 13 bulgu cikti:
  //   somut computedValue ILE  -> 3 bulgu, 3/3 dogru (-2 / 120 km / 2/3 saat;
  //     ucunde de sorunun kendi cozumu da siklarda olmayan bir degere variyor)
  //   computedValue OLMADAN    -> 10 bulgu, incelenen 3'u yanlis pozitif
  //     ("okul" Turkce degil sandi, "sutcu"de benzesmeyi gormedi, "arabayi"da
  //     kaynastirmayi gormedi)
  // computedValue de model ciktisidir; parser/alan dogrulamasi matematiksel
  // dogrulama degildir. Ayrica seceneklerde esdeger gosterimler olabilir.
  // Bu nedenle deterministik bir alan-cozucu gelene kadar her NO_CORRECT_OPTION
  // insan incelemesine gider, yayini tek basina durdurmaz.
  const noCorrectOption = findings.some((f) => f.code === 'NO_CORRECT_OPTION')
  const unverifiableNoOption = noCorrectOption

  // ── Oncelik ──────────────────────────────────────────────────────────────
  const blocking = findings.some(
    (f) =>
      severityOf(f.code) === 'blocking' &&
      !(f.code === 'WRONG_KEY_SUSPECTED' && uncorroboratedWrongKey) &&
      !(f.code === 'SOLUTION_CONTRADICTS_ANSWER' && uncorroboratedSolution) &&
      f.code !== 'NO_CORRECT_OPTION',
  )
  const advisory = findings.some((f) => severityOf(f.code) === 'advisory')
  const unresolvedBlind = blindOk.length > 0 && blindAgreementRatio !== null && blindConsensusIndex === null && findings.every((f) => f.code !== 'NO_CORRECT_OPTION')

  let verdict: VerdictResult['verdict']
  if (blocking) verdict = 'REJECTED'
  else if (inconclusive) verdict = 'INCONCLUSIVE'
  else if (
    advisory ||
    uncorroboratedWrongKey ||
    uncorroboratedSolution ||
    unverifiableNoOption ||
    unresolvedBlind ||
    (blindAgreementRatio !== null && blindAgreementRatio < opts.minBlindAgreement)
  ) {
    verdict = 'NEEDS_REVIEW'
  } else verdict = 'APPROVED'

  const rationale =
    verdict === 'APPROVED'
      ? 'uc kanit da olumlu; bilinen kusur siniflarindan temiz'
      : [...findings.map((f) => `${f.code}(${severityOf(f.code)})`), ...notes].join('; ') || verdict

  return { verdict, findings, blindConsensusIndex, blindAgreementRatio, rationale }
}
