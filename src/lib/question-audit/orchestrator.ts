/**
 * Uc ajani calistirip `AuditRun` ureten orkestrator.
 *
 * SORUMLULUK SINIRI: burasi IO yapar, KARAR VERMEZ. Verdict turetmesi
 * `deriveVerdict` icinde saf kalir. Boylece ham ciktilar saklanip esik
 * degistiginde gecmis para harcamadan yeniden puanlanabilir.
 */

import { createHash } from 'node:crypto'
import { toBlindView, seededPermutation, toCanonicalIndex } from './blind-view'
import {
  buildAdversarialPrompt,
  buildBlindSolverPrompt,
  buildSolutionVerifierPrompt,
  PROMPT_VERSION,
} from './prompts'
import type { LlmProvider } from './provider'
import { adversarialShape, blindSolverShape, solutionVerifierShape } from './response-shapes'
import { runAgent } from './run-agent'
import { adversarialSchema, blindSolverSchema, solutionVerifierSchema } from './schemas'
import type {
  AdversarialPayload,
  AgentOutcome,
  AuditRun,
  BlindSolverPayload,
  QuestionDraft,
  SolutionVerifierPayload,
  AuditExecutionIdentity,
} from './types'
import { deriveVerdict, DEFAULT_DERIVE_OPTIONS, type DeriveOptions } from './verdict'

export interface AuditConfig {
  /**
   * Kor cozucu ornek sayisi. 1 ise mutabakat sinyali olusmaz — belirsizlik
   * olcusu kaybolur ve tek stokastik ornekle soru reddedilir.
   */
  blindSamples: number
  /**
   * Kor cozucude sicaklik DUSUK OLMAMALI.
   *
   * Cok-ornekli mutabakat ancak ornekler bagimsizsa anlamlidir. temperature
   * 0.1'de uc ornek neredeyse ayni cikar; "3/3 mutabakat" dejenere bir
   * dagilimdan gelir ve sahte guven uretir. Belirsizligi gercekten olcmek
   * istiyorsak entropi gerekli.
   *
   * (Ayrica: dusuk sicaklik determinizm DEGILDIR — seed yok, batching kaynakli
   * non-determinizm temp 0'da bile kalir.)
   */
  blindTemperature: number
  adversarialTemperature: number
  /** Cikarim isi, yargi degil — burada dusuk sicaklik yerinde. */
  verifierTemperature: number
  maxOutputTokens: { blind: number; adversarial: number; verifier: number }
  timeoutMs: number
  maxAttempts: number
}

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  blindSamples: 3,
  blindTemperature: 0.7,
  adversarialTemperature: 0.2,
  verifierTemperature: 0.0,
  // CoT reasoning uzun; dar limit MAX_TOKENS truncation'i dogurur.
  maxOutputTokens: { blind: 2048, adversarial: 2048, verifier: 1536 },
  timeoutMs: 60_000,
  maxAttempts: 3,
}

export interface AuditProviders {
  blind: LlmProvider
  adversarial: LlmProvider
  verifier: LlmProvider
}

export const QUESTION_QUALITY_POLICY_VERSION = 'question-quality@1'

/** Yalniz model ciktisini etkileyen ayarlar hash'e girer; retry/rate ayarlari girmez. */
export function auditExecutionIdentity(
  providers: AuditProviders,
  config: AuditConfig,
): AuditExecutionIdentity {
  const generationConfig: Record<string, unknown> = {
    blindSamples: config.blindSamples,
    blindTemperature: config.blindTemperature,
    adversarialTemperature: config.adversarialTemperature,
    verifierTemperature: config.verifierTemperature,
    maxOutputTokens: config.maxOutputTokens,
  }
  const generationConfigSha256 = createHash('sha256')
    .update(JSON.stringify(generationConfig))
    .digest('hex')

  return {
    policyVersion: QUESTION_QUALITY_POLICY_VERSION,
    generationConfig,
    generationConfigSha256,
    providerIds: {
      blind: providers.blind.id,
      adversarial: providers.adversarial.id,
      verifier: providers.verifier.id,
    },
    modelIds: {
      blind: providers.blind.modelId,
      adversarial: providers.adversarial.modelId,
      verifier: providers.verifier.modelId,
    },
    promptVersions: {
      blind: PROMPT_VERSION.blindSolver,
      adversarial: PROMPT_VERSION.adversarial,
      verifier: PROMPT_VERSION.solutionVerifier,
    },
  }
}

/**
 * Icerik hash'inden tureyen deterministik seed.
 * Ayni soru her kosuda AYNI sik siralarini alir → bir uyusmazligi tekrar
 * incelerken kosu birebir yeniden kurulabilir.
 */
function seedFor(contentSha256: string, sampleIndex: number): number {
  let h = 2166136261
  const s = `${contentSha256}:${sampleIndex}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * runAgent tasarim geregi FIRLATMAZ (her hata `failed` outcome'a cevrilir), bu
 * yuzden Promise.all burada guvenli. Yine de allSettled kullaniyoruz: ileride
 * bir degisiklik firlatma yolu acarsa, TEK bir ariza digerlerinin ODENMIS
 * sonucunu silmesin. Promise.all ilk reddediste reddeder ve o iki sonuc kaybolur.
 */
async function settleAll<T extends readonly Promise<unknown>[]>(promises: T): Promise<{ -readonly [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }> {
  return Promise.allSettled(promises) as Promise<{ -readonly [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }>
}

function unwrap<T>(r: PromiseSettledResult<AgentOutcome<T>>): AgentOutcome<T> {
  if (r.status === 'fulfilled') return r.value
  return {
    status: 'failed',
    error: { kind: 'transport', message: `beklenmeyen istisna: ${String(r.reason)}`, retryable: true },
    telemetry: { providerId: 'unknown', modelId: 'unknown', promptVersion: 'unknown', latencyMs: 0, inputTokens: null, outputTokens: null, finishReason: null },
    raw: null,
  }
}

export async function executeAudit(
  draft: QuestionDraft,
  providers: AuditProviders,
  config: AuditConfig = DEFAULT_AUDIT_CONFIG,
): Promise<AuditRun> {
  const n = draft.options.length
  const execution = auditExecutionIdentity(providers, config)

  // ── Kor cozucu: k ornek, HER BIRI permute ────────────────────────────────
  // Tek ornekte bile permute ediyoruz. Gerekce: bankada cevap indeksi dagilimi
  // duz olmayabilir ve LLM'lerin bilinen pozisyon yanliligi (or. C'yi secme
  // egilimi) bu skewle ortusurse mutabakat orani SAHTE yuksek cikar. Permutasyon
  // bu confound'u kaldirir — kalibrasyon sayisinin gecerliligi buna bagli.
  const blindPromises = Array.from({ length: config.blindSamples }, (_, i) => {
    const view = toBlindView(draft, seededPermutation(n, seedFor(draft.contentSha256, i)))
    const prompt = buildBlindSolverPrompt(view)
    return runAgent({
      provider: providers.blind,
      promptVersion: PROMPT_VERSION.blindSolver,
      request: {
        system: prompt.system,
        user: prompt.user,
        temperature: config.blindTemperature,
        maxOutputTokens: config.maxOutputTokens.blind,
        schema: blindSolverShape(n),
      },
      schema: blindSolverSchema(n),
      timeoutMs: config.timeoutMs,
      maxAttempts: config.maxAttempts,
    }).then((outcome): AgentOutcome<BlindSolverPayload> => {
      // Ekran indeksini KANONIGE cevir — deriveVerdict kanonik bekler.
      if (outcome.status !== 'ok') return outcome
      return {
        ...outcome,
        data: {
          reasoning: outcome.data.reasoning,
          predictedAnswerIndex: toCanonicalIndex(view, outcome.data.predictedAnswerIndex),
          computedValue: outcome.data.computedValue,
        },
      }
    })
  })

  // ── Adversarial: permute EDILMEZ ─────────────────────────────────────────
  // Bulgular optionIndexes ile sik referansi veriyor; permutasyon bu indeksleri
  // ekran uzayina tasir ve geri cevirmek gerekir. Tek cagri oldugu icin
  // pozisyon-yanliligi olcusu de yok — permute etmenin kazanci yok, riski var.
  const adversarialView = toBlindView(draft)
  const advPrompt = buildAdversarialPrompt(adversarialView)
  const adversarialPromise = runAgent<AdversarialPayload>({
    provider: providers.adversarial,
    promptVersion: PROMPT_VERSION.adversarial,
    request: {
      system: advPrompt.system,
      user: advPrompt.user,
      temperature: config.adversarialTemperature,
      maxOutputTokens: config.maxOutputTokens.adversarial,
      schema: adversarialShape(),
    },
    schema: adversarialSchema(n),
    timeoutMs: config.timeoutMs,
    maxAttempts: config.maxAttempts,
  })

  // ── Cozum denetcisi: cozum yoksa ATLANIR ─────────────────────────────────
  // Cozum metninin olmamasi bir ICERIK kusuru degil, yayin politikasi sorusudur
  // (deterministik kapinin isi). LLM'e sordurup soru reddettirmiyoruz.
  const hasSolution = (draft.solutionText ?? '').trim().length > 0
  const verifierPromise: Promise<AgentOutcome<SolutionVerifierPayload>> = hasSolution
    ? (() => {
        const vPrompt = buildSolutionVerifierPrompt(draft)
        return runAgent<SolutionVerifierPayload>({
          provider: providers.verifier,
          promptVersion: PROMPT_VERSION.solutionVerifier,
          request: {
            system: vPrompt.system,
            user: vPrompt.user,
            temperature: config.verifierTemperature,
            maxOutputTokens: config.maxOutputTokens.verifier,
            schema: solutionVerifierShape(n),
          },
          schema: solutionVerifierSchema(n),
          timeoutMs: config.timeoutMs,
          maxAttempts: config.maxAttempts,
        })
      })()
    : Promise.resolve<AgentOutcome<SolutionVerifierPayload>>({
        status: 'skipped',
        reason: 'cozum metni yok',
      })

  const [blindResults, advResult, verifierResult] = await settleAll([
    Promise.all(blindPromises),
    adversarialPromise,
    verifierPromise,
  ] as const)

  return {
    questionId: draft.questionId,
    revisionId: draft.revisionId,
    contentSha256: draft.contentSha256,
    optionCount: n,
    markedAnswerIndex: draft.markedAnswerIndex,
    inputSnapshot: structuredClone(draft),
    execution,
    blind:
      blindResults.status === 'fulfilled'
        ? blindResults.value
        : [unwrap<BlindSolverPayload>(blindResults)],
    adversarial: unwrap<AdversarialPayload>(advResult),
    verifier: unwrap<SolutionVerifierPayload>(verifierResult),
    executedAt: new Date().toISOString(),
  }
}

/** Kolaylik sarmalayici: kosu + verdict birlikte. Karar yine saf fonksiyondan gelir. */
export async function auditQuestion(
  draft: QuestionDraft,
  providers: AuditProviders,
  config: AuditConfig = DEFAULT_AUDIT_CONFIG,
  deriveOptions: DeriveOptions = DEFAULT_DERIVE_OPTIONS,
) {
  const run = await executeAudit(draft, providers, config)
  return { run, verdict: deriveVerdict(run, deriveOptions) }
}
