/**
 * Kalibrasyon kosucusu.
 *
 * CALISTIRMA: `npm run audit:calibrate -- --limit 50 --confirm`
 * Kopru: database/run-question-audit.mjs (vite ssrLoadModule)
 *
 * GUVENLIK: --confirm olmadan HICBIR LLM cagrisi yapilmaz. Kosu plani ve
 * maliyet tahmini basilir, cikilir. 1890 soruluk bir kosuyu yanlislikla
 * baslatmak kolay olmamali.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertPromotionEvidence } from './benchmark'
import { runCalibration, type CalibrationItem, type CalibrationReport } from './calibration'
import { auditExecutionIdentity, DEFAULT_AUDIT_CONFIG, QUESTION_QUALITY_POLICY_VERSION, type AuditConfig, type AuditProviders } from './orchestrator'
import { createGeminiProvider, createOpenAiCompatibleProvider } from './provider'
import {
  toValidationDecisionRow,
  toValidationRunRows,
  type ValidationDecisionRow,
  type ValidationRunRow,
} from './persistence'
import { partitionRows, type QuestionRow } from './question-source'
import type { AuditExecutionIdentity, AuditRun, QuestionDraft } from './types'

export interface RunnerArgs {
  limit: number
  category: string | null
  game: string | null
  concurrency: number
  confirm: boolean
  blindSamples: number
  model: string
  provider: 'gemini' | 'deepseek'
  /** Ardisik iki cagri arasi min bekleme (ms). Free tier icin yukselt. */
  minIntervalMs: number
  out: string
  revisionId: string | null
  governanceReady: boolean
  /** İnsan-altın listedeki questionId + content SHA çiftlerini birebir seçer. */
  goldLabelsPath: string | null
}

export function parseArgs(argv: readonly string[]): RunnerArgs {
  const a: RunnerArgs = {
    limit: 25,
    category: null,
    game: null,
    concurrency: 4,
    confirm: false,
    blindSamples: DEFAULT_AUDIT_CONFIG.blindSamples,
    model: process.env.BLIND_SOLVER_MODEL_ID || 'gemini-2.5-flash-lite',
    provider: (process.env.AUDIT_PROVIDER as 'gemini' | 'deepseek') || 'gemini',
    minIntervalMs: Number(process.env.AUDIT_MIN_INTERVAL_MS || 0),
    out: 'database/question-audit-calibration-report.json',
    revisionId: null,
    governanceReady: false,
    goldLabelsPath: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--limit') a.limit = Number(argv[++i])
    else if (k === '--category') a.category = argv[++i]
    else if (k === '--game') a.game = argv[++i]
    else if (k === '--concurrency') a.concurrency = Number(argv[++i])
    else if (k === '--samples') a.blindSamples = Number(argv[++i])
    else if (k === '--model') a.model = argv[++i]
    else if (k === '--provider') a.provider = argv[++i] === 'deepseek' ? 'deepseek' : 'gemini'
    else if (k === '--min-interval') a.minIntervalMs = Number(argv[++i])
    else if (k === '--out') a.out = argv[++i]
    else if (k === '--revision-id') a.revisionId = argv[++i]
    else if (k === '--governance-ready') a.governanceReady = true
    else if (k === '--gold-labels') a.goldLabelsPath = argv[++i]
    else if (k === '--confirm') a.confirm = true
  }
  return a
}

/** Soru basi cagri sayisi: k kor ornek + adversarial + (cozum varsa) verifier. */
export function callsPerQuestion(drafts: readonly QuestionDraft[], blindSamples: number): number {
  const withSolution = drafts.filter((d) => (d.solutionText ?? '').trim().length > 0).length
  return drafts.length * (blindSamples + 1) + withSolution
}

export interface RunnerDeps {
  fetchRows: (args: RunnerArgs) => Promise<QuestionRow[]>
  /**
   * Ham kosuyu question_validation_runs'a yazar (migration 130).
   * Verilmezse kosu yine calisir, yalniz gecmis yeniden puanlanamaz.
   */
  persistRun?: (rows: ValidationRunRow[]) => Promise<void>
  persistDecision?: (decision: ValidationDecisionRow) => Promise<void>
  /** Yetkili karar yazimi icin ayni execution identity'yi gecmis insan-altin rapor. */
  promotionEvidence?: unknown
  loadCachedRun?: (draft: QuestionDraft, identity: AuditExecutionIdentity) => Promise<AuditRun | null>
  log?: (line: string) => void
  writeReport?: (path: string, report: CalibrationReport) => void
  now?: () => number
}

function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '-'
}

export async function main(argv: readonly string[], deps: RunnerDeps): Promise<CalibrationReport | null> {
  const args = parseArgs(argv)
  const log = deps.log ?? ((l: string) => console.log(l))

  const rows = await deps.fetchRows(args)
  const { drafts, rejected, byReason, byWarning } = partitionRows(rows, {
    strictExamOptionCount: args.governanceReady || args.revisionId !== null || args.goldLabelsPath !== null,
  })

  log(`Cekilen satir      : ${rows.length}`)
  log(`Deterministik kapi : ${drafts.length} gecti, ${rejected.length} denetlenemez`)
  if (rejected.length) log(`  gerekce          : ${JSON.stringify(byReason)}`)
  // Metadata kusurlari denetimi ENGELLEMEZ — rapora yazilir, soru olculur.
  if (Object.keys(byWarning).length) log(`  metadata uyarisi : ${JSON.stringify(byWarning)}`)

  const calls = callsPerQuestion(drafts, args.blindSamples)
  log(`Saglayici          : ${args.provider}${args.provider === 'deepseek' ? ' (sema dayatmaz — Zod tek garanti)' : ''}`)
  log(`Model              : ${args.model}`)
  log(`Kor ornek / soru   : ${args.blindSamples}`)
  log(`Toplam LLM cagrisi : ${calls}`)
  if (args.minIntervalMs > 0) {
    log(`Rate gate          : ${args.minIntervalMs}ms -> tahmini sure ~${fmt((calls * args.minIntervalMs) / 60000)} dk`)
  }

  if (!args.confirm) {
    log('')
    log('DRY-RUN: --confirm verilmedi, hicbir LLM cagrisi yapilmadi.')
    return null
  }

  // Saglayici secimi. DIKKAT: saglayici degistirmek `provider_id`'yi degistirir,
  // o da onbellek anahtarinin parcasidir -> tum banka yeniden kosulur. Bu
  // bilincli: farkli saglayicinin ciktisi digerinin yerine gecemez.
  const providerFor = (role: string) => {
    const modelId = process.env[`${role}_MODEL_ID`] || args.model
    if (args.provider === 'deepseek') {
      return createOpenAiCompatibleProvider({
        apiKey: process.env.DEEPSEEK_API_KEY ?? '',
        modelId,
        minIntervalMs: args.minIntervalMs,
      })
    }
    return createGeminiProvider({
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
      modelId,
      minIntervalMs: args.minIntervalMs,
    })
  }

  const providers: AuditProviders = {
    blind: providerFor('BLIND_SOLVER'),
    adversarial: providerFor('ADVERSARIAL'),
    verifier: providerFor('VERIFIER'),
  }

  const config: AuditConfig = { ...DEFAULT_AUDIT_CONFIG, blindSamples: args.blindSamples }
  const identity = auditExecutionIdentity(providers, config)
  // Ham kosular benchmark oncesi saklanabilir; ancak yayin kapisini etkileyen
  // kararlar yalniz AYNI provider/model/prompt/ayar kimliginin insan-altin
  // terfi kanitiyla yazilir. Kontrol LLM cagrisindan once fail-closed calisir.
  if (deps.persistDecision) assertPromotionEvidence(deps.promotionEvidence, identity)
  const categoryById = new Map(rows.map((r) => [r.id, r.category || r.game]))

  // Kismi sonuclari biriktir: uzun kosuda cokme olursa odenen cagrilar kaybolmasin.
  const partial: CalibrationItem[] = []
  const startedMs = (deps.now ?? Date.now)()
  const runId = globalThis.crypto.randomUUID()
  let persistErrors = 0

  const report = await runCalibration({
    drafts,
    categoryOf: (d) => categoryById.get(d.questionId) ?? 'bilinmeyen',
    providers,
    config,
    concurrency: args.concurrency,
    loadRun: deps.loadCachedRun
      ? (draft) => deps.loadCachedRun!(draft, identity)
      : undefined,
    onItem: (item) => void partial.push(item),
    onRun: deps.persistRun
      ? async (auditRun, _verdict) => {
          try {
            await deps.persistRun!(toValidationRunRows(auditRun, runId))
          } catch (e) {
            // Persist hatasi KOSUYU DURDURMAZ: odenen cagrilarin sonucu
            // rapora yine yazilir. Sessiz de kalmaz.
            persistErrors++
            if (persistErrors <= 3) log(`  ! kayit hatasi: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      : undefined,
    onDecision: deps.persistDecision
      ? async (auditRun, verdict) => {
          try {
            await deps.persistDecision!(
              toValidationDecisionRow(auditRun, verdict, runId, QUESTION_QUALITY_POLICY_VERSION),
            )
          } catch (e) {
            persistErrors++
            if (persistErrors <= 3) log(`  ! karar kayit hatasi: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      : undefined,
    onProgress: (done, total, last) => {
      if (done % 10 === 0 || done === total) {
        const elapsed = ((deps.now ?? Date.now)() - startedMs) / 1000
        log(`  ${done}/${total} (${fmt((done / total) * 100, 0)}%) ${fmt(elapsed, 0)}s son=${last.verdict}`)
      }
    },
  })

  // ── Ozet ────────────────────────────────────────────────────────────────
  const a = report.blindAgreement
  log('')
  log('== KALIBRASYON ==')
  log(`Soru                 : ${report.total}`)
  log(`Verdict              : ${JSON.stringify(report.byVerdict)}`)
  log(`Kor mutabakat        : ${a.agreed}/${a.agreed + a.disagreed} = ${a.ratio === null ? 'HESAPLANAMADI' : `%${fmt(a.ratio * 100)}`}`)
  log(`  uzlasmayan soru    : ${a.noConsensus}`)
  log(`HAT GUVENILIRLIGI    : ${report.reliability.failedCalls}/${report.reliability.totalCalls} cagri basarisiz = %${fmt(report.reliability.failureRate * 100)}`)
  log(`  hata tipleri       : ${JSON.stringify(report.reliability.byErrorKind)}`)
  log(`Token                : in=${report.cost.inputTokens} out=${report.cost.outputTokens}`)
  log(`Onbellek             : ${report.cache.hits} isabet, ${report.cache.misses} yeni kosu`)
  if (deps.persistRun) log(`Kayit (run_id)       : ${runId}${persistErrors ? ` — ${persistErrors} yazma hatasi` : ''}`)
  log('')
  log('Kategori bazinda mutabakat:')
  for (const [cat, s] of Object.entries(report.byCategory).sort((x, y) => (x[1].ratio ?? 1) - (y[1].ratio ?? 1))) {
    log(`  ${cat.padEnd(20)} ${s.agreed}/${s.n} = ${s.ratio === null ? '-' : `%${fmt(s.ratio * 100)}`}`)
  }

  // OKUMA UYARISI: arizali bir hatta mutabakat orani anlamsizdir. Iki sayi
  // ayni ekranda; onceki denetim raporlarinda %54 hata ile "0 bulgu" ayri
  // yerlerde yaziyordu ve okuyan "banka temiz" saniyordu.
  if (report.reliability.failureRate > 0.05) {
    log('')
    log(`!! UYARI: cagri hata orani %${fmt(report.reliability.failureRate * 100)}. Mutabakat orani bu hatta GUVENILMEZ.`)
  }

  const write = deps.writeReport ?? ((p: string, r: CalibrationReport) => writeFileSync(p, JSON.stringify(r, null, 2)))
  write(join(process.cwd(), args.out), report)
  log(
    `\nRapor: ${args.out} (${report.rejected.length} red, ${report.disagreements.length} uyusmazlik, ` +
      `${report.needsReview.length} insan incelemesi)`,
  )

  if (persistErrors > 0) {
    throw new Error(`${persistErrors} denetim kosusu question_validation_runs tablosuna yazilamadi; rapor korundu`)
  }

  return report
}
