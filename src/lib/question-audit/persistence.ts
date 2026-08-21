/**
 * AuditRun -> question_validation_runs satirlari.
 *
 * SAF MAPPER, IO YOK: DB'siz test edilebilir ve kosucudan bagimsizdir.
 *
 * NEDEN HAM CIKTI SAKLANIR:
 *   deriveVerdict saf bir fonksiyon oldugu icin politika degisince gecmis
 *   yeniden puanlanabilir — AMA yalniz ham ajan ciktisi elde kalirsa.
 *   2026-08-16'da politika iki kez degisti (MULTIPLE_CORRECT advisory'ye;
 *   WRONG_KEY dogrulama kurali) ve 4434 soruluk kosu ancak YAKLASIK yeniden
 *   puanlanabildi, cunku yalniz turetilmis CalibrationItem saklanmisti.
 */

import { adversarialSchema, blindSolverSchema, solutionVerifierSchema } from './schemas'
import type {
  AdversarialPayload,
  AgentErrorKind,
  AgentOutcome,
  AgentTelemetry,
  AuditExecutionIdentity,
  AuditRun,
  BlindSolverPayload,
  QuestionDraft,
  SolutionVerifierPayload,
  VerdictResult,
} from './types'

export type AgentName = 'blind_solver' | 'adversarial' | 'solution_verifier'

export interface ValidationRunRow {
  question_id: string
  revision_id: string | null
  content_sha256: string
  agent: AgentName
  sample_index: number
  model_id: string
  provider_id: string
  prompt_version: string
  policy_version: string
  generation_config_sha256: string
  generation_config: Record<string, unknown>
  input_snapshot: QuestionDraft
  status: 'ok' | 'failed' | 'skipped'
  error_kind: string | null
  error_message: string | null
  error_retryable: boolean | null
  skip_reason: string | null
  raw_output: string | null
  parsed_output: unknown | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  finish_reason: string | null
  run_id: string
  executed_at: string
}

export interface ValidationDecisionRow {
  question_id: string
  revision_id: string | null
  content_sha256: string
  policy_version: string
  verdict: VerdictResult['verdict']
  findings: VerdictResult['findings']
  rationale: string
  blind_consensus_index: number | null
  blind_agreement_ratio: number | null
  run_id: string
  decided_at: string
}

function identityFor(run: AuditRun, agent: AgentName) {
  const key = agent === 'blind_solver' ? 'blind' : agent === 'adversarial' ? 'adversarial' : 'verifier'
  return {
    provider_id: run.execution.providerIds[key],
    model_id: run.execution.modelIds[key],
    prompt_version: run.execution.promptVersions[key],
  }
}

function rowFor(
  run: AuditRun,
  runId: string,
  agent: AgentName,
  sampleIndex: number,
  outcome: AgentOutcome<unknown>,
): ValidationRunRow {
  const base = {
    question_id: run.questionId,
    // Governance kapaliyken kosucu revisionId'yi questionId'ye dusuruyor;
    // o durumda NULL yaz ki "gercek revizyon" ile karismasin.
    revision_id: run.revisionId === run.questionId ? null : run.revisionId,
    content_sha256: run.contentSha256,
    agent,
    sample_index: sampleIndex,
    run_id: runId,
    policy_version: run.execution.policyVersion,
    generation_config_sha256: run.execution.generationConfigSha256,
    generation_config: run.execution.generationConfig,
    input_snapshot: run.inputSnapshot,
    executed_at: run.executedAt,
    ...identityFor(run, agent),
  }

  if (outcome.status === 'skipped') {
    return {
      ...base,
      status: 'skipped',
      error_kind: null,
      error_message: null,
      error_retryable: null,
      skip_reason: outcome.reason,
      raw_output: null,
      parsed_output: null,
      latency_ms: null,
      input_tokens: null,
      output_tokens: null,
      finish_reason: null,
    }
  }

  const t = outcome.telemetry
  const common = {
    ...base,
    latency_ms: t.latencyMs,
    input_tokens: t.inputTokens,
    output_tokens: t.outputTokens,
    finish_reason: t.finishReason,
    skip_reason: null,
  }

  // KRITIK: failed satiri hicbir icerik bulgusu tasimaz. Transport arizasi ile
  // icerik kusurunu ayni kolonda toplamak, olculen %54 hata oranini
  // veritabanindaki en yaygin "kusur" haline getirirdi.
  if (outcome.status === 'failed') {
    return {
      ...common,
      status: 'failed',
      error_kind: outcome.error.kind,
      error_message: outcome.error.message,
      error_retryable: outcome.error.retryable,
      raw_output: outcome.raw,
      parsed_output: null,
    }
  }
  return {
    ...common,
    status: 'ok',
    error_kind: null,
    error_message: null,
    error_retryable: null,
    raw_output: outcome.raw,
    parsed_output: outcome.data,
  }
}

export function toValidationRunRows(run: AuditRun, runId: string): ValidationRunRow[] {
  return [
    ...run.blind.map((o, i) => rowFor(run, runId, 'blind_solver', i, o)),
    rowFor(run, runId, 'adversarial', 0, run.adversarial),
    rowFor(run, runId, 'solution_verifier', 0, run.verifier),
  ]
}

export function toValidationDecisionRow(
  run: AuditRun,
  verdict: VerdictResult,
  runId: string,
  policyVersion = run.execution.policyVersion,
): ValidationDecisionRow {
  return {
    question_id: run.questionId,
    revision_id: run.revisionId === run.questionId ? null : run.revisionId,
    content_sha256: run.contentSha256,
    policy_version: policyVersion,
    verdict: verdict.verdict,
    findings: verdict.findings,
    rationale: verdict.rationale,
    blind_consensus_index: verdict.blindConsensusIndex,
    blind_agreement_ratio: verdict.blindAgreementRatio,
    run_id: run.sourceRunId ?? runId,
    decided_at: run.executedAt,
  }
}

function assertSame<T>(rows: readonly ValidationRunRow[], pick: (row: ValidationRunRow) => T, label: string): T {
  const first = pick(rows[0]!)
  const encoded = JSON.stringify(first)
  if (rows.some((row) => JSON.stringify(pick(row)) !== encoded)) {
    throw new Error(`question_validation_runs bozuk: ${label} satirlar arasinda farkli`)
  }
  return first
}

function telemetryOf(row: ValidationRunRow): AgentTelemetry {
  return {
    providerId: row.provider_id,
    modelId: row.model_id,
    promptVersion: row.prompt_version,
    latencyMs: row.latency_ms ?? 0,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    finishReason: row.finish_reason,
  }
}

function outcomeOf<T>(row: ValidationRunRow, parse: (value: unknown) => T): AgentOutcome<T> {
  if (row.status === 'skipped') {
    if (!row.skip_reason) throw new Error('question_validation_runs bozuk: skipped nedeni yok')
    return { status: 'skipped', reason: row.skip_reason }
  }
  const telemetry = telemetryOf(row)
  if (row.status === 'failed') {
    if (!row.error_kind) throw new Error('question_validation_runs bozuk: failed error_kind yok')
    return {
      status: 'failed',
      error: {
        kind: row.error_kind as AgentErrorKind,
        message: row.error_message ?? 'saklanmis ajan hatasi',
        retryable: row.error_retryable ?? false,
      },
      telemetry,
      raw: row.raw_output,
    }
  }
  if (row.raw_output === null) throw new Error('question_validation_runs bozuk: ok raw_output yok')
  return { status: 'ok', data: parse(row.parsed_output), telemetry, raw: row.raw_output }
}

/** Saklanmis ham satirlardan para harcamadan yeniden puanlanabilir AuditRun kurar. */
export function fromValidationRunRows(rows: readonly ValidationRunRow[]): AuditRun {
  if (rows.length === 0) throw new Error('question_validation_runs bos')
  const inputSnapshot = assertSame(rows, (r) => r.input_snapshot, 'input_snapshot')
  const generationConfig = assertSame(rows, (r) => r.generation_config, 'generation_config')
  const execution: AuditExecutionIdentity = {
    policyVersion: assertSame(rows, (r) => r.policy_version, 'policy_version'),
    generationConfigSha256: assertSame(rows, (r) => r.generation_config_sha256, 'generation_config_sha256'),
    generationConfig,
    providerIds: {
      blind: rows.find((r) => r.agent === 'blind_solver')?.provider_id ?? '',
      adversarial: rows.find((r) => r.agent === 'adversarial')?.provider_id ?? '',
      verifier: rows.find((r) => r.agent === 'solution_verifier')?.provider_id ?? '',
    },
    modelIds: {
      blind: rows.find((r) => r.agent === 'blind_solver')?.model_id ?? '',
      adversarial: rows.find((r) => r.agent === 'adversarial')?.model_id ?? '',
      verifier: rows.find((r) => r.agent === 'solution_verifier')?.model_id ?? '',
    },
    promptVersions: {
      blind: rows.find((r) => r.agent === 'blind_solver')?.prompt_version ?? '',
      adversarial: rows.find((r) => r.agent === 'adversarial')?.prompt_version ?? '',
      verifier: rows.find((r) => r.agent === 'solution_verifier')?.prompt_version ?? '',
    },
  }
  const optionCount = inputSnapshot.options.length
  const blindRows = rows.filter((r) => r.agent === 'blind_solver').sort((a, b) => a.sample_index - b.sample_index)
  const advRows = rows.filter((r) => r.agent === 'adversarial')
  const verifierRows = rows.filter((r) => r.agent === 'solution_verifier')
  const expectedBlind = Number(generationConfig.blindSamples)
  if (blindRows.length !== expectedBlind || advRows.length !== 1 || verifierRows.length !== 1) {
    throw new Error('question_validation_runs eksik: tum ajan/ornek satirlari bulunamadi')
  }
  return {
    sourceRunId: assertSame(rows, (r) => r.run_id, 'run_id'),
    questionId: inputSnapshot.questionId,
    revisionId: inputSnapshot.revisionId,
    contentSha256: inputSnapshot.contentSha256,
    optionCount,
    markedAnswerIndex: inputSnapshot.markedAnswerIndex,
    inputSnapshot,
    execution,
    blind: blindRows.map((row) => outcomeOf<BlindSolverPayload>(row, (v) => blindSolverSchema(optionCount).parse(v))),
    adversarial: outcomeOf<AdversarialPayload>(advRows[0]!, (v) => adversarialSchema(optionCount).parse(v)),
    verifier: outcomeOf<SolutionVerifierPayload>(verifierRows[0]!, (v) => solutionVerifierSchema(optionCount).parse(v)),
    executedAt: assertSame(rows, (r) => r.executed_at, 'executed_at'),
  }
}
