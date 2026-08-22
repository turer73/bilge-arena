/**
 * Kalibrasyon kosusu — hattin KENDISINI olcer, soru bankasini degil.
 *
 * NE OLCUYORUZ VE NEDEN:
 *   Kor cozucunun mevcut cevap anahtariyla mutabakat orani, iki bilinmeyeni
 *   AYNI ANDA sinirlar: modelin dogrulugu ve bankanin hata orani. Tek basina
 *   hangisinin ne kadar oldugunu soylemez — ama uyusmazlik listesi insan
 *   incelemesine gidince ayrisir, ve o inceleme etiketli benchmark'i uretir.
 *
 *   Bu yuzden ILK kosu kor cozucuyle yapilmali: elde 1890 sorunun isaretli
 *   cevabi zaten var, yani bedava bir referans var. Adversarial'in ise
 *   referansi YOK — yanlis-pozitif orani ancak kor cozucunun mutabik oldugu
 *   altkume uzerinde olculebilir. Sira bu yuzden zorunlu.
 *
 * BASLANGIC REFERANSI (bu hattin yerini alacagi mevcut durum):
 *   database/audit-*-report.json uc kosu: 32 soru judged, 0 bulgu, 38/70 hata
 *   (%54). Yani "0 bulgu" bir kalite kaniti degil, olcum arizasiydi.
 */

import type { AuditConfig, AuditProviders } from './orchestrator'
import { auditQuestion, QUESTION_QUALITY_POLICY_VERSION } from './orchestrator'
import { PROMPT_VERSION } from './prompts'
import type { AgentOutcome, AuditRun, Finding, QuestionDraft, Verdict, VerdictResult } from './types'
import type { DeriveOptions } from './verdict'
import { DEFAULT_DERIVE_OPTIONS, deriveVerdict } from './verdict'

export interface CalibrationItem {
  questionId: string
  /** Altın etiketi değişmiş bir revizyona yanlışlıkla bağlamayı engeller. */
  contentSha256: string
  category: string
  verdict: Verdict
  markedAnswerIndex: number
  blindConsensusIndex: number | null
  blindAgreementRatio: number | null
  /**
   * TAM bulgu (kod + kanit), yalniz kod DEGIL.
   *
   * Kanit metni olmadan insan adjudikasyonu yapilamaz: "iki sik dogru" diyip
   * hangileri oldugunu soylemeyen bir kayit, reviewer kuyrugunu hizlandirmasi
   * gerekirken yavaslatir. Ilk 200'luk kosuda tam bu oldu — 5 blocking bulguyu
   * degerlendirmek icin sorulari tek tek DB'den cekmek gerekti.
   */
  findings: Finding[]
  rationale: string
  /** Ajan cagrilarindan kaci basarisiz oldu / toplam. */
  failedCalls: number
  totalCalls: number
  latencyMs: number
  inputTokens: number
  outputTokens: number
  cached: boolean
}

export interface CalibrationReport {
  startedAt: string
  finishedAt: string
  policyVersion: string
  providerIds: { blind: string; adversarial: string; verifier: string }
  modelIds: { blind: string; adversarial: string; verifier: string }
  promptVersions: Record<string, string>
  config: AuditConfig
  total: number

  /** İnsan-altın benchmark'ın tüm soruları ölçebilmesi için türetilmiş özetler. */
  items: CalibrationItem[]

  /** Verdict dagilimi. */
  byVerdict: Record<Verdict, number>

  /**
   * ASIL SAYI: kor cozucunun uzlastigi sorularda anahtarla mutabakat orani.
   * Payda = uzlasma saglanmis VE en az bir gecerli ornek olan sorular.
   */
  blindAgreement: { agreed: number; disagreed: number; noConsensus: number; ratio: number | null }

  /** Kategori bazinda ayni oran — nerede model zayif, nerede banka zayif. */
  byCategory: Record<string, { n: number; agreed: number; ratio: number | null }>

  /** Hat guvenilirligi. Bu yuksekse yukaridaki oranlar guvenilmez. */
  reliability: { totalCalls: number; failedCalls: number; failureRate: number; byErrorKind: Record<string, number> }

  cost: { inputTokens: number; outputTokens: number; totalLatencyMs: number }
  cache: { hits: number; misses: number }

  /**
   * Insan incelemesine gidecek listeler — etiketli benchmark bunlardan dogar.
   *
   * `rejected` AYRI tutulmali: bir red kor cozucu uyusmazligindan gelmek
   * ZORUNDA DEGIL (adversarial blocking bulgusu veya cozum-anahtar celiskisi
   * de reddeder). Ilk 50'lik pilotta tam bu oldu — REJECTED=1 sayildi ama
   * hicbir listede gorunmedi, yani raporun en onemli kalemi kayipti.
   */
  disagreements: CalibrationItem[]
  needsReview: CalibrationItem[]
  rejected: CalibrationItem[]
}

export interface CalibrationInput {
  drafts: readonly QuestionDraft[]
  /** Soru -> kategori (rapor kirilimi icin; DB'deki `category`). */
  categoryOf: (draft: QuestionDraft) => string
  providers: AuditProviders
  config: AuditConfig
  deriveOptions?: DeriveOptions
  /** Es zamanli soru sayisi. Rate-limitli provider'da kapi zaten serilestirir. */
  concurrency?: number
  onProgress?: (done: number, total: number, last: CalibrationItem) => void
  /** Kismi sonuclari diske yazmak icin — uzun kosuda cokme koruması. */
  onItem?: (item: CalibrationItem) => void | Promise<void>
  /**
   * HAM kosuyu persist etmek icin (question_validation_runs, migration 130).
   * `onItem` turetilmis ozeti verir; bu ham ajan ciktilarini verir ve politika
   * degisince gecmisin GERCEKTEN yeniden puanlanabilmesini saglayan tek yoldur.
   */
  onRun?: (run: AuditRun, verdict: VerdictResult) => void | Promise<void>
  /** Politika karari cache hit'te de yazilir; ham kosudan ayri yasam dongusu. */
  onDecision?: (run: AuditRun, verdict: VerdictResult) => void | Promise<void>
  /** Ucretli cagri ONCESI ayni icerik/model/prompt/ayar kosusunu arar. */
  loadRun?: (draft: QuestionDraft) => Promise<AuditRun | null>
}

function tallyOutcome(
  outcomes: readonly AgentOutcome<unknown>[],
): { failed: number; total: number; latency: number; input: number; output: number; kinds: string[] } {
  let failed = 0
  let total = 0
  let latency = 0
  let input = 0
  let output = 0
  const kinds: string[] = []
  for (const o of outcomes) {
    if (o.status === 'skipped') continue
    total++
    latency += o.telemetry.latencyMs
    input += o.telemetry.inputTokens ?? 0
    output += o.telemetry.outputTokens ?? 0
    if (o.status === 'failed') {
      failed++
      kinds.push(o.error.kind)
    }
  }
  return { failed, total, latency, input, output, kinds }
}

/**
 * JSONB nesne anahtarlarini kanonik sirada geri dondurur. Postgres JSONB,
 * JS'deki eklenme sirasini korumadigi icin duz JSON.stringify ayni snapshot'i
 * farkli gosterebilir; dizilerin sirasi ise anlamli oldugundan korunur.
 */
function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === 'object') {
      const record = input as Record<string, unknown>
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key])]))
    }
    return input
  }
  return JSON.stringify(normalize(value))
}

/** Sinirli es zamanlilikla sirali is havuzu. */
async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

export async function runCalibration(input: CalibrationInput): Promise<CalibrationReport> {
  const startedAt = new Date().toISOString()
  const deriveOptions = input.deriveOptions ?? DEFAULT_DERIVE_OPTIONS
  const errorKinds: Record<string, number> = {}
  let cacheHits = 0

  const items = await mapPool(input.drafts, input.concurrency ?? 4, async (draft, i) => {
    const cachedRun = await input.loadRun?.(draft)
    if (cachedRun && canonicalJson(cachedRun.inputSnapshot) !== canonicalJson(draft)) {
      throw new Error(`onbellek butunluk hatasi: ${draft.questionId} girdisi saklanan snapshot ile ayni degil`)
    }
    const cached = cachedRun !== null && cachedRun !== undefined
    const result = cached
      ? { run: cachedRun, verdict: deriveVerdict(cachedRun, deriveOptions) }
      : await auditQuestion(draft, input.providers, input.config, deriveOptions)
    const { run, verdict } = result
    if (cached) cacheHits++
    const t = tallyOutcome([...run.blind, run.adversarial, run.verifier])
    for (const k of t.kinds) errorKinds[k] = (errorKinds[k] ?? 0) + 1

    const item: CalibrationItem = {
      questionId: draft.questionId,
      contentSha256: draft.contentSha256,
      category: input.categoryOf(draft),
      verdict: verdict.verdict,
      markedAnswerIndex: draft.markedAnswerIndex,
      blindConsensusIndex: verdict.blindConsensusIndex,
      blindAgreementRatio: verdict.blindAgreementRatio,
      findings: verdict.findings,
      rationale: verdict.rationale,
      failedCalls: t.failed,
      totalCalls: t.total,
      latencyMs: cached ? 0 : t.latency,
      inputTokens: cached ? 0 : t.input,
      outputTokens: cached ? 0 : t.output,
      cached,
    }
    if (!cached) await input.onRun?.(run, verdict)
    await input.onDecision?.(run, verdict)
    await input.onItem?.(item)
    input.onProgress?.(i + 1, input.drafts.length, item)
    return item
  })

  // ── Toplama ──────────────────────────────────────────────────────────────
  const byVerdict: Record<Verdict, number> = { APPROVED: 0, REJECTED: 0, NEEDS_REVIEW: 0, INCONCLUSIVE: 0 }
  const byCategory: CalibrationReport['byCategory'] = {}
  let agreed = 0
  let disagreed = 0
  let noConsensus = 0
  let totalCalls = 0
  let failedCalls = 0
  let inputTokens = 0
  let outputTokens = 0
  let totalLatencyMs = 0

  for (const it of items) {
    byVerdict[it.verdict]++
    totalCalls += it.totalCalls
    failedCalls += it.failedCalls
    inputTokens += it.inputTokens
    outputTokens += it.outputTokens
    totalLatencyMs += it.latencyMs

    const cat = (byCategory[it.category] ??= { n: 0, agreed: 0, ratio: null })

    // Mutabakat sayimi yalniz UZLASMA SAGLANMIS sorularda anlamlidir.
    // Uzlasmayanlar ayri sayilir; paydaya katilirsa oran yapay olarak duser.
    if (it.blindConsensusIndex === null) {
      noConsensus++
      continue
    }
    cat.n++
    if (it.blindConsensusIndex === it.markedAnswerIndex) {
      agreed++
      cat.agreed++
    } else {
      disagreed++
    }
  }

  for (const c of Object.values(byCategory)) c.ratio = c.n > 0 ? c.agreed / c.n : null

  const denom = agreed + disagreed

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    policyVersion: QUESTION_QUALITY_POLICY_VERSION,
    providerIds: {
      blind: input.providers.blind.id,
      adversarial: input.providers.adversarial.id,
      verifier: input.providers.verifier.id,
    },
    modelIds: {
      blind: input.providers.blind.modelId,
      adversarial: input.providers.adversarial.modelId,
      verifier: input.providers.verifier.modelId,
    },
    promptVersions: {
      blind: PROMPT_VERSION.blindSolver,
      adversarial: PROMPT_VERSION.adversarial,
      verifier: PROMPT_VERSION.solutionVerifier,
    },
    config: input.config,
    total: items.length,
    items,
    byVerdict,
    blindAgreement: { agreed, disagreed, noConsensus, ratio: denom > 0 ? agreed / denom : null },
    byCategory,
    reliability: {
      totalCalls,
      failedCalls,
      failureRate: totalCalls > 0 ? failedCalls / totalCalls : 0,
      byErrorKind: errorKinds,
    },
    cost: { inputTokens, outputTokens, totalLatencyMs },
    cache: { hits: cacheHits, misses: items.length - cacheHits },
    disagreements: items.filter(
      (i) => i.blindConsensusIndex !== null && i.blindConsensusIndex !== i.markedAnswerIndex,
    ),
    needsReview: items.filter((i) => i.verdict === 'NEEDS_REVIEW'),
    rejected: items.filter((i) => i.verdict === 'REJECTED'),
  }
}
