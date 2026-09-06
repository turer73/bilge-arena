import { z } from 'zod'
import { PROMPT_VERSION } from './prompts'

export const FIVE_MODEL_SLOTS = ['deepseek', 'gemini', 'terra', 'luna', 'sol'] as const
export type FiveModelSlot = typeof FIVE_MODEL_SLOTS[number]

export interface FiveModelReport {
  questionId: string
  revisionId: string
  contentSha256: string
  policyVersion: string
  revisionStatus: string
  questionText: string
  options: string[]
  markedAnswerIndex: number
  completedModels: number
  requiredModels: 5
  agreement: 'incomplete' | 'disagreement' | 'unanimous'
  matchesKey: boolean | null
  capped: boolean
  models: Array<{
    slot: FiveModelSlot
    label: string
    status: 'missing' | 'failed' | 'invalid' | 'conflict' | 'complete'
    providerId: string | null
    modelId: string | null
    executedAt: string | null
    answerIndex: number | null
    computedValue: string | null
    summary: string | null
    sampleCount: number
  }>
  warnings: string[]
}

/**
 * Kimlikler bir gorunum adi degil, persistence katmaninin sakladigi kesin
 * provider/model cifti. Yeni bir model ancak buraya acikca eklenerek rapora
 * dahil olur; serbest prefix/alias eslesmesi bagimsizlik sinyalini bozmaz.
 */
export const TRUSTED_MODEL_PAIRS: Readonly<Record<FiveModelSlot, readonly { providerId: string; modelId: string }[]>> = {
  deepseek: [
    { providerId: 'deepseek:deepseek-chat', modelId: 'deepseek-chat' },
    { providerId: 'deepseek:deepseek-v4-flash', modelId: 'deepseek-v4-flash' },
    { providerId: 'deepseek:deepseek-v4-pro', modelId: 'deepseek-v4-pro' },
  ],
  gemini: [
    { providerId: 'gemini:gemini-2.5-flash-lite', modelId: 'gemini-2.5-flash-lite' },
    { providerId: 'gemini:gemini-2.5-pro', modelId: 'gemini-2.5-pro' },
  ],
  terra: [{ providerId: 'openai:gpt-5.6-terra', modelId: 'gpt-5.6-terra' }],
  luna: [{ providerId: 'openai:gpt-5.6-luna', modelId: 'gpt-5.6-luna' }],
  sol: [{ providerId: 'openai:gpt-5.6-sol', modelId: 'gpt-5.6-sol' }],
}

const parsedOutputSchema = z.object({
  reasoning: z.string().min(1),
  predictedAnswerIndex: z.number().int().nullable(),
  computedValue: z.string().max(200).nullable().optional(),
}).strict()

const snapshotSchema = z.object({
  questionId: z.string().uuid(),
  revisionId: z.string().uuid(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  questionText: z.string(),
  options: z.array(z.string()).min(2).max(5),
  markedAnswerIndex: z.number().int(),
}).passthrough()

export interface FiveModelRunRow {
  question_id: string
  revision_id: string | null
  content_sha256: string
  agent: string
  sample_index: number
  provider_id: string | null
  model_id: string
  prompt_version: string
  policy_version: string | null
  generation_config: unknown
  generation_config_sha256: string | null
  run_id: string
  status: string
  parsed_output: unknown
  input_snapshot: unknown
  executed_at: string | null
}

export interface FiveModelSubject {
  questionId: string
  revisionId: string
  contentSha256: string
  policyVersion: string
  revisionStatus: string
  questionText: string
  options: string[]
  markedAnswerIndex: number
}

function slotFor(row: FiveModelRunRow): FiveModelSlot | null {
  for (const slot of FIVE_MODEL_SLOTS) {
    if (TRUSTED_MODEL_PAIRS[slot].some((pair) => pair.providerId === row.provider_id && pair.modelId === row.model_id)) return slot
  }
  return null
}

function safeSummary(reasoning: string): string {
  return reasoning.replace(/\s+/g, ' ').trim().slice(0, 280)
}

function isSameSnapshot(row: FiveModelRunRow, subject: FiveModelSubject): boolean {
  const parsed = snapshotSchema.safeParse(row.input_snapshot)
  return parsed.success
    && parsed.data.questionId === subject.questionId
    && parsed.data.revisionId === subject.revisionId
    && parsed.data.contentSha256 === subject.contentSha256
    && parsed.data.questionText === subject.questionText
    && JSON.stringify(parsed.data.options) === JSON.stringify(subject.options)
    && parsed.data.markedAnswerIndex === subject.markedAnswerIndex
}

function expectedSamples(value: unknown): number | null {
  const parsed = z.object({ blindSamples: z.number().int().min(1).max(20) }).passthrough().safeParse(value)
  return parsed.success ? parsed.data.blindSamples : null
}

function blank(slot: FiveModelSlot) {
  return { slot, label: slot === 'deepseek' ? 'DeepSeek' : slot === 'gemini' ? 'Gemini' : slot[0]!.toUpperCase() + slot.slice(1), status: 'missing' as const, providerId: null, modelId: null, executedAt: null, answerIndex: null, computedValue: null, summary: null, sampleCount: 0 }
}

/** Saf, fail-closed okuma modeli. AI uzlasisi asla yayin/onay yetkisi vermez. */
export function buildFiveModelReport(subject: FiveModelSubject, rows: readonly FiveModelRunRow[], capped = false): FiveModelReport {
  const warnings: string[] = []
  if (capped) warnings.push('Kayıt okuma sınırına ulaşıldı; rapor eksik olabilir.')
  const models = FIVE_MODEL_SLOTS.map((slot) => {
    // Bu denetimler route sorgusunu tekrar eder: saf fonksiyon baska bir
    // cagirandan kullanilsa bile rol/politika satiri "bagimsiz model" sayilmaz.
    const matching = rows.filter((row) => row.question_id === subject.questionId && row.revision_id === subject.revisionId && row.content_sha256 === subject.contentSha256 && row.agent === 'blind_solver' && row.policy_version === subject.policyVersion && slotFor(row) === slot)
    if (matching.length === 0) return blank(slot)
    if (matching.some((row) => !Number.isFinite(Date.parse(row.executed_at ?? '')))) return { ...blank(slot), status: 'invalid' as const, sampleCount: matching.length }
    const dated = matching.filter((row) => Number.isFinite(Date.parse(row.executed_at ?? '')))
    if (dated.length === 0) return { ...blank(slot), status: 'invalid' as const, sampleCount: matching.length }
    const newest = Math.max(...dated.map((row) => Date.parse(row.executed_at!)))
    const cohort = dated.filter((row) => Date.parse(row.executed_at!) === newest)
    const base = { ...blank(slot), providerId: cohort[0]!.provider_id, modelId: cohort[0]!.model_id, executedAt: cohort[0]!.executed_at, sampleCount: cohort.length }
    if (cohort.some((row) => row.provider_id !== base.providerId || row.model_id !== base.modelId || row.run_id !== cohort[0]!.run_id || row.generation_config_sha256 !== cohort[0]!.generation_config_sha256)) return { ...base, status: 'conflict' as const }
    if (!z.string().uuid().safeParse(cohort[0]!.run_id).success || !/^[0-9a-f]{64}$/.test(cohort[0]!.generation_config_sha256 ?? '')) return { ...base, status: 'invalid' as const }
    if (cohort.some((row) => row.status !== 'ok')) return { ...base, status: 'failed' as const }
    if (cohort.some((row) => !isSameSnapshot(row, subject))) return { ...base, status: 'invalid' as const }
    if (cohort.some((row) => row.prompt_version !== PROMPT_VERSION.blindSolver)) return { ...base, status: 'invalid' as const }
    const expected = expectedSamples(cohort[0]!.generation_config)
    if (expected === null || cohort.some((row) => expectedSamples(row.generation_config) !== expected)) return { ...base, status: 'invalid' as const }
    if (cohort.some((row) => JSON.stringify(row.generation_config) !== JSON.stringify(cohort[0]!.generation_config))) return { ...base, status: 'conflict' as const }
    const outputs = cohort.map((row) => parsedOutputSchema.safeParse(row.parsed_output))
    if (outputs.some((output) => !output.success)) return { ...base, status: 'invalid' as const }
    const values = outputs.map((output) => output.data!)
    if (values.some((value) => value.predictedAnswerIndex !== null && (value.predictedAnswerIndex < 0 || value.predictedAnswerIndex >= subject.options.length))) return { ...base, status: 'invalid' as const }
    const samples = new Set(cohort.map((row) => row.sample_index))
    if (samples.size !== cohort.length) return { ...base, status: 'conflict' as const }
    if (cohort.length !== expected || [...samples].some((index) => index < 0 || index >= expected)) return { ...base, status: 'conflict' as const }
    const answers = new Set(values.map((value) => value.predictedAnswerIndex))
    if (answers.size !== 1) return { ...base, status: 'conflict' as const }
    const nullValues = new Set(values.filter((value) => value.predictedAnswerIndex === null).map((value) => value.computedValue?.trim() ?? ''))
    if (nullValues.size > 1 || nullValues.has('')) return { ...base, status: 'conflict' as const }
    const first = values[0]!
    if (first.predictedAnswerIndex === null && !first.computedValue?.trim()) return { ...base, status: 'invalid' as const }
    return { ...base, status: 'complete' as const, answerIndex: first.predictedAnswerIndex, computedValue: first.computedValue ?? null, summary: safeSummary(first.reasoning) }
  })
  const complete = models.filter((model) => model.status === 'complete')
  const answers = new Set(complete.map((model) => model.answerIndex === null ? `value:${model.computedValue?.trim() ?? ''}` : `index:${model.answerIndex}`))
  if (complete.some((model) => model.answerIndex === null)) warnings.push('En az bir model şıklarda karşılık bulamadı; insan incelemesi gerekir.')
  const agreement = capped || complete.length !== FIVE_MODEL_SLOTS.length ? 'incomplete' : answers.size === 1 ? 'unanimous' : 'disagreement'
  return { ...subject, completedModels: complete.length, requiredModels: 5, agreement, matchesKey: agreement === 'incomplete' ? null : agreement === 'unanimous' && complete[0]!.answerIndex === subject.markedAnswerIndex, capped, models, warnings }
}
