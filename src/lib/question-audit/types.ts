/**
 * 3 Gecisli Kor Hakem — sozlesmeler.
 *
 * TASARIM KARARLARI (gerekce burada, cunku kodun kendisi bunlari soylemiyor):
 *
 * 1. TRANSPORT != VERDICT. `AgentOutcome` bir ayrik birlesim: 'ok' veya 'failed'.
 *    Bir HTTP hatasi ASLA bir icerik bulgusuna donusmez. Onceki taslakta her
 *    ajanin catch blogu uydurma bir kusur donduruyordu (`AMBIGUOUS_WORDING`,
 *    `INCOMPLETE_SOLUTION`); olculen %54 provider hata oraniyla bu, denetim
 *    kaydindaki en yaygin "kusur"un saf gurultu olmasi demekti.
 *
 * 2. SEVERITY MODELE SORULMAZ. Model yalniz `FlawCode` uretir; blocking/advisory
 *    esleme `FLAW_SEVERITY` tablosunda, yani kodda. Mevcut production judge'i
 *    severity'yi prompt'ta belirlemeye calisiyor ("major YASAK") ve sonuc 32
 *    soruda 0 bulgu.
 *
 * 3. TEK KUSUR DEGIL, LISTE. Bir soru ayni anda hem eksik kosul hem cift dogru
 *    tasiyabilir. Tek enum alani bu bilgiyi kaybeder.
 *
 * 4. SIK SAYISI SABIT DEGIL. LGS 4, TYT/AYT 5. Hicbir yerde 5 varsayilmaz.
 */

/** Sinav referansi — sik sayisini ve prompt dilini belirler. Serbest metin: DB'de de oyle. */
export type ExamRef = string

/**
 * Denetlenecek soru revizyonu.
 *
 * `contentSha256` ZORUNLU: denetim sonucunun hangi icerige ait oldugunu kanitlar.
 * Onsuz TOCTOU acigi var — A revizyonu denetlenir, icerik duzenlenir, sonuc
 * B'ye yapistirilir. Migration 106 bu hash'i zaten uretiyor.
 */
export interface QuestionDraft {
  /** questions.id */
  questionId: string
  /** question_content_revisions.id */
  revisionId: string
  /** question_content_revisions.content_sha256 */
  contentSha256: string
  examRef: ExamRef
  subject: string
  topic: string | null
  questionText: string
  /** Oncul/tablo/veri — ogrenci ekraninda soru kokunden ONCE render edilir. */
  passage: string | null
  /** 4 (LGS) veya 5 (TYT/AYT). Uzunluk asla varsayilmaz. */
  options: string[]
  markedAnswerIndex: number
  /** Bankada bos ve cok kisa cozumler var (olculdu: %2 bos, %17 <25 karakter). */
  solutionText: string | null
}

// ── Kusur katalogu ─────────────────────────────────────────────────────────

export type FlawCode =
  // Kor Cozucu uretir
  | 'WRONG_KEY_SUSPECTED'
  | 'NO_CORRECT_OPTION'
  // Adversarial uretir
  | 'MULTIPLE_CORRECT'
  | 'MISSING_PREMISE'
  | 'AMBIGUOUS_WORDING'
  | 'STEM_MISSING_TOKEN'
  // Cozum Denetcisi uretir
  | 'SOLUTION_CONTRADICTS_ANSWER'
  | 'INCOMPLETE_SOLUTION'
  | 'LOGICAL_FALLACY'

export type Severity = 'blocking' | 'advisory'

/**
 * blocking = yayini engeller (REJECTED)
 * advisory = insana gider (NEEDS_REVIEW), tek basina reddetmez
 *
 * INCOMPLETE_SOLUTION ve LOGICAL_FALLACY bilerek advisory: bunlar tutarlilik
 * degil pedagojik kalite yargisi ve migration 106'nin taniminca Stage 2 isi.
 * Bankanin %17'sinin cozumu 25 karakterden kisa; bunlari bloklamak bankanin
 * altida birini oldurur.
 */
export const FLAW_SEVERITY: Record<FlawCode, Severity> = {
  WRONG_KEY_SUSPECTED: 'blocking',
  NO_CORRECT_OPTION: 'blocking',
  SOLUTION_CONTRADICTS_ANSWER: 'blocking',
  // OLCUME DAYALI (200 soruluk kalibrasyon, gemini-2.5-flash-lite):
  // MULTIPLE_CORRECT 4 kez uretildi, 4'u de elle adjudike edildi ve 3'u
  // YANLIS POZITIF cikti (~%75 FP). Ornekler:
  //   - "mademki" ki-bitisik yazim hatasi sanildi (TDK istisnasi, DOGRU yazim)
  //   - "okul" Arapca kokenli iddia edildi (TDK turetmesi, oku- kokunden)
  // Bu oranla yayin kapisi olamaz. Advisory'ye alindi: bulgu KAYBOLMAZ, insana
  // gider, ama tek basina soru oldurmez. Daha guclu bir modelde (or. 2.5-pro)
  // yeniden olculup blocking'e alinabilir — tek satirlik geri donus.
  MULTIPLE_CORRECT: 'advisory',
  MISSING_PREMISE: 'advisory',
  AMBIGUOUS_WORDING: 'advisory',
  // Soru kokunden kelime dusmesi (or. phrasal-verb sorusunda fiil yok, siklar
  // yalniz edat -> cumle hicbir sikla gramatik olmuyor). Canli bankada 3 ornek
  // dogrulandi, ucu de ai_gemini_gaps partisinden. ADVISORY: kod yeni, yanlis
  // pozitif orani HENUZ OLCULMEDI. Olcmeden blocking yapmak, bu oturumda
  // MULTIPLE_CORRECT ile yasanan hatanin (%75 FP ile kapi kurmak) tekrari olur.
  STEM_MISSING_TOKEN: 'advisory',
  INCOMPLETE_SOLUTION: 'advisory',
  LOGICAL_FALLACY: 'advisory',
}

/**
 * `evidence` ZORUNLU. "Iki sik dogru" diyip hangileri oldugunu soylemeyen bir
 * bulgu reviewer kuyrugunu hizlandirmaz, yavaslatir.
 */
export interface Finding {
  code: FlawCode
  evidence: string
  /** MULTIPLE_CORRECT icin hangi siklar; digerlerinde opsiyonel. */
  optionIndexes?: number[]
}

export function severityOf(code: FlawCode): Severity {
  return FLAW_SEVERITY[code]
}

export function hasBlocking(findings: readonly Finding[]): boolean {
  return findings.some((f) => severityOf(f.code) === 'blocking')
}

// ── Transport ──────────────────────────────────────────────────────────────

export type AgentErrorKind =
  /** ag/HTTP/5xx */
  | 'transport'
  /** JSON parse veya Zod dogrulamasi basarisiz */
  | 'schema'
  /** finishReason=MAX_TOKENS — CoT uzun reasoning urettigi icin gercek risk */
  | 'truncated'
  /** finishReason=SAFETY veya bos candidate */
  | 'blocked'
  | 'timeout'

export interface AgentError {
  kind: AgentErrorKind
  message: string
  retryable: boolean
}

export interface AgentTelemetry {
  /** Provider uygulamasi; ayni model farkli endpoint/uygulamada farkli davranabilir. */
  providerId: string
  modelId: string
  /** Prompt degistiginde artar. Onsuz bir verdict degisiminin sorudan mi
   *  prompt'tan mi geldigi asla bilinemez. */
  promptVersion: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  finishReason: string | null
}

export type AgentOutcome<T> =
  | { status: 'ok'; data: T; telemetry: AgentTelemetry; raw: string }
  | { status: 'failed'; error: AgentError; telemetry: AgentTelemetry; raw: string | null }
  /** Onkosul saglanmadi (or. cozum metni yok) — hata DEGIL. */
  | { status: 'skipped'; reason: string }

// ── Ajan ciktilar ──────────────────────────────────────────────────────────

/**
 * Kor Cozucu. `predictedAnswerIndex` null => model bir sonuca vardi ama hicbir
 * sikla eslestiremedi. Bu, NO_CORRECT_OPTION'in dogrudan kanitidir; bu yuzden
 * o kategori adversarial ajandan buraya alindi (orada sorunun ikinci kez
 * cozulmesini gerektiriyordu ve iki cozum celistiginde kural yoktu).
 */
export interface BlindSolverPayload {
  reasoning: string
  predictedAnswerIndex: number | null
  /** Modelin buldugu ham deger ("61", "2 mol"). null-index halinde kanit. */
  computedValue: string | null
}

export interface AdversarialPayload {
  reasoning: string
  /** Bos dizi = kusur bulunamadi. Bu basarili bir denetimdir, yenilgi degil. */
  findings: Finding[]
}

/**
 * Cozum Denetcisi. DIKKAT: bu ajan karsilastirma YAPMAZ — yalniz cozumun
 * hangi sikka vardigini CIKARIR. Karsilastirmayi `deriveVerdict` yapar.
 *
 * Gerekce: "cozum isaretli cevabi destekliyor mu?" yonlendirici bir sorudur ve
 * bu ajan anahtari da cozumu de gordugu icin sycophancy'ye en acik olanidir —
 * yani mevcut production judge'inin basarisiz oldugu tam kurulum. Cikarim +
 * kodda karsilastirma, ayni bilgiyi yanlilik yuzeyi olmadan verir.
 */
export interface SolutionVerifierPayload {
  reasoning: string
  solutionConcludesIndex: number | null
  solutionCompleteness: 'adequate' | 'terse'
}

// ── Kosu kaydi ve verdict ──────────────────────────────────────────────────

export type Verdict =
  /** Uc kanit da olumlu. "Kanitlandi" degil, "bilinen kusur siniflarindan temiz". */
  | 'APPROVED'
  /** Blocking bulgu var. Yazara geri. */
  | 'REJECTED'
  /** Advisory bulgu veya ornekler arasi mutabakatsizlik. Insana. */
  | 'NEEDS_REVIEW'
  /** Ajan(lar) calismadi. Kuyruga geri — insana DEGIL. */
  | 'INCONCLUSIVE'

export interface AuditRun {
  /** DB'den geri yuklendiyse ham satirlarin kaynak run_id'si. */
  sourceRunId?: string
  questionId: string
  revisionId: string
  contentSha256: string
  optionCount: number
  markedAnswerIndex: number
  /** Denetlenen girdinin eksiksiz, degistirilemez anlik goruntusu. */
  inputSnapshot: QuestionDraft
  /** Onbellek ve birebir yeniden oynatma icin kosu kimligi. */
  execution: AuditExecutionIdentity
  /** k-of-n: birden fazla ornek, siklari permute edilerek. */
  blind: AgentOutcome<BlindSolverPayload>[]
  adversarial: AgentOutcome<AdversarialPayload>
  verifier: AgentOutcome<SolutionVerifierPayload>
  executedAt: string
}

export interface AuditExecutionIdentity {
  policyVersion: string
  generationConfigSha256: string
  generationConfig: Record<string, unknown>
  providerIds: {
    blind: string
    adversarial: string
    verifier: string
  }
  modelIds: {
    blind: string
    adversarial: string
    verifier: string
  }
  promptVersions: {
    blind: string
    adversarial: string
    verifier: string
  }
}

export interface VerdictResult {
  verdict: Verdict
  findings: Finding[]
  /** Kor cozucu ornekleri arasi uzlasan indeks; uzlasma yoksa null. */
  blindConsensusIndex: number | null
  /** Uzlasan ornek / gecerli ornek. Modelin beyan ettigi `confidence` DEGIL. */
  blindAgreementRatio: number | null
  /** Neden bu verdict — insan okunur, tek satir. */
  rationale: string
}
