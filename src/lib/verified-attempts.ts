import 'server-only'
import { isTytSocialV2LearnerEnabled } from '@/lib/feature-flags/tyt-social-v2-server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { DENEME_CONFIGS, getModeById } from '@/lib/constants/modes'
import type { GameSlug } from '@/lib/constants/games'
import type { Database } from '@/types/database.client'
import type { GameMode } from '@/types/database'
import type { PersonalizedMockItem } from '@/lib/study/personalized-mock'
import {
  parseQuestionContent,
  toPublicQuestionContent,
  type PublicQuestion,
  type QuestionRow,
} from '@/lib/utils/question-public'

const privateQuestionContentSchema = z.object({
  question: z.string().min(1).max(20_000),
  options: z.array(z.string().max(10_000)).min(2).max(5),
  answer: z.number().int().min(0).max(4),
}).passthrough()

const snapshotMetadataSchema = z.object({
  game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
  category: z.string().min(1).max(120),
  subcategory: z.string().max(120).optional(),
  topic: z.string().max(200).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  levelTag: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  examRef: z.string().max(20).optional(),
  basePoints: z.number().int().nonnegative(),
}).strict()

const verifiedQuestionSnapshotSchema = z.object({
  position: z.number().int().min(1).max(100),
  questionId: z.string().uuid(),
  revisionId: z.string().uuid(),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  content: privateQuestionContentSchema,
  correctOption: z.number().int().min(0).max(4),
  metadata: snapshotMetadataSchema,
}).strict().refine(
  item => item.content.answer === item.correctOption,
  { message: 'snapshot answer mismatch' },
)

const verifiedExamQuestionSnapshotSchema = verifiedQuestionSnapshotSchema.safeExtend({
  position: z.number().int().min(0).max(39),
  sourceBucket: z.enum(['wrong', 'weak', 'coverage']),
})

const normalSnapshotSchema = z.object({
  items: z.array(verifiedQuestionSnapshotSchema).min(1).max(100),
}).strict()

const officialTytSocialSectionTicketSchema = z.object({
  attemptId: z.string().uuid(),
  expiresAt: z.string().datetime({ offset: true }),
  policyVersion: z.literal('tyt-social-2026-v1'),
  variant: z.enum(['questions_16_20', 'questions_21_25']),
  artifactKind: z.literal('official_section'),
  snapshot: z.object({
    items: z.array(verifiedQuestionSnapshotSchema).length(20),
  }).strict(),
  replayed: z.boolean(),
  composerVersion: z.literal('tyt-social-official-section-v1'),
}).strict()

const examSnapshotSchema = z.object({
  items: z.array(verifiedExamQuestionSnapshotSchema).length(40),
}).strict()

export type VerifiedQuestionSnapshot = z.infer<typeof verifiedQuestionSnapshotSchema>
export type VerifiedExamQuestionSnapshot = z.infer<typeof verifiedExamQuestionSnapshotSchema>

export interface VerifiedAttemptTicket {
  attemptId: string
  expiresAt: string
  /** Private server-only data. Deliberately non-enumerable to resist accidental response spreading. */
  readonly questionSnapshots: readonly VerifiedQuestionSnapshot[]
}

export interface VerifiedExamAttemptTicket extends VerifiedAttemptTicket {
  strategyEligible: true
  blueprintVersion: string
  readonly questionSnapshots: readonly VerifiedExamQuestionSnapshot[]
}

export type TytSocialOfficialSectionIssueFailure =
  | 'tyt_social_section_setup_required'
  | 'tyt_social_section_conflict'
  | 'tyt_social_section_expired'
  | 'tyt_social_section_unavailable'
  | 'tyt_social_section_issue_failed'

function withPrivateSnapshots<T extends object, S extends VerifiedQuestionSnapshot>(
  value: T,
  snapshots: readonly S[],
): T & { readonly questionSnapshots: readonly S[] } {
  const frozenSnapshots = Object.freeze([...snapshots])
  return Object.defineProperty(value, 'questionSnapshots', {
    value: frozenSnapshots,
    enumerable: false,
    configurable: false,
    writable: false,
  }) as T & { readonly questionSnapshots: readonly S[] }
}

function snapshotsMatchNormalRequest(
  snapshots: readonly VerifiedQuestionSnapshot[],
  questionIds: readonly string[],
  game: GameSlug,
): boolean {
  return snapshots.length === questionIds.length && snapshots.every((snapshot, index) => (
    snapshot.position === index + 1
    && snapshot.questionId === questionIds[index]
    && snapshot.metadata.game === game
  ))
}

/**
 * The only browser projection permitted for a private issuance snapshot.
 * Answer, solution, explanation, hint, revision/hash and provenance stay server-only.
 */
export function toPublicVerifiedQuestions(
  snapshots: readonly VerifiedQuestionSnapshot[],
): PublicQuestion[] {
  const ids = new Set<string>()
  return snapshots.map((snapshot) => {
    if (ids.has(snapshot.questionId)) throw new Error('verified_attempt_snapshot_invalid')
    ids.add(snapshot.questionId)
    const content = parseQuestionContent(snapshot.content as QuestionRow['content'])
    if (!content || content.answer !== snapshot.correctOption) {
      throw new Error('verified_attempt_snapshot_invalid')
    }
    return {
      id: snapshot.questionId,
      game: snapshot.metadata.game,
      category: snapshot.metadata.category,
      subcategory: snapshot.metadata.subcategory ?? null,
      topic: snapshot.metadata.topic ?? null,
      difficulty: snapshot.metadata.difficulty,
      level_tag: snapshot.metadata.levelTag ?? null,
      base_points: snapshot.metadata.basePoints,
      content: toPublicQuestionContent(content),
    }
  })
}

export function getVerifiedAttemptDurationSec(game: GameSlug, mode: GameMode): number {
  if (mode === 'practice') {
    return 7200
  }
  if (mode === 'deneme') {
    const totalTime = DENEME_CONFIGS[game]?.totalTime ?? 3600
    return Math.min(7200, totalTime + 300)
  }
  const config = getModeById(mode)
  const raw = config.questionCount * config.timePerQuestion + 300
  const clamped = Math.max(5, raw)
  return Math.min(7200, clamped)
}

/**
 * Service-only candidate filter for TYT Social. The branch choice is never
 * returned to callers or logs; only the permitted subset, in input order.
 */
export async function filterTytSocialQuestionIds(
  admin: SupabaseClient<Database>,
  userId: string,
  questionIds: readonly string[],
): Promise<string[]> {
  const deduped = Array.from(new Set(questionIds))
  if (deduped.length === 0) return []
  if (deduped.length > 1000) throw new Error('tyt_social_candidate_filter_failed')
  const { data, error } = await admin.rpc('filter_tyt_social_question_candidates', {
    p_user_id: userId,
    p_question_ids: deduped,
  })
  if (error) throw new Error('tyt_social_candidate_filter_failed')
  const parsed = z.object({
    policyVersion: z.string().min(1).max(80),
    allowedQuestionIds: z.array(z.string().uuid()).max(1000),
  }).strict().safeParse(data)
  if (!parsed.success) throw new Error('tyt_social_candidate_filter_failed')
  const inputIds = new Set(deduped)
  if (
    new Set(parsed.data.allowedQuestionIds).size !== parsed.data.allowedQuestionIds.length
    || parsed.data.allowedQuestionIds.some(id => !inputIds.has(id))
  ) throw new Error('tyt_social_candidate_filter_failed')
  return parsed.data.allowedQuestionIds
}

/**
 * Service-only official TYT Social section composition. The private branch,
 * answer keys and provenance stay on the server; callers receive snapshots as
 * a non-enumerable property and must project them with toPublicVerifiedQuestions.
 */
export async function issueVerifiedTytSocialOfficialSection(
  admin: SupabaseClient<Database>,
  input: { userId: string; requestId: string },
): Promise<VerifiedAttemptTicket> {
  const durationSec = getVerifiedAttemptDurationSec('sosyal', 'deneme')
  let result: { data: unknown; error: { code?: string; message?: string } | null }
  try {
    result = await admin.rpc('compose_and_issue_verified_tyt_social_section_attempt', {
      p_user_id: input.userId,
      p_duration_sec: durationSec,
      p_request_id: input.requestId,
    })
  } catch {
    throw new Error('tyt_social_section_unavailable')
  }
  if (result.error) {
    const code = result.error.code ?? ''
    const message = result.error.message ?? ''
    if (code === 'P0002' && message === 'TYT Social policy selection required') {
      throw new Error('tyt_social_section_setup_required')
    }
    if (code === '22023' && message === 'TYT Social official-section replay payload differs') {
      throw new Error('tyt_social_section_conflict')
    }
    if (
      INFRA_ERROR_CODES.has(code)
      || ['P0002', '22023', '23505', '23514', '42501', '55000'].includes(code)
    ) {
      throw new Error('tyt_social_section_unavailable')
    }
    throw new Error('tyt_social_section_issue_failed')
  }

  const parsed = officialTytSocialSectionTicketSchema.safeParse(result.data)
  if (!parsed.success) throw new Error('tyt_social_section_issue_failed')
  if (Date.parse(parsed.data.expiresAt) <= Date.now()) {
    throw new Error('tyt_social_section_expired')
  }
  const snapshots = parsed.data.snapshot.items
  const questionIds = new Set(snapshots.map((snapshot) => snapshot.questionId))
  if (
    questionIds.size !== 20
    || snapshots.some((snapshot, index) => (
      snapshot.position !== index + 1
      || snapshot.metadata.game !== 'sosyal'
      || snapshot.metadata.examRef !== 'TYT'
    ))
  ) throw new Error('tyt_social_section_issue_failed')

  return withPrivateSnapshots(
    { attemptId: parsed.data.attemptId, expiresAt: parsed.data.expiresAt },
    snapshots,
  )
}

export async function issueVerifiedAttempt(
  admin: SupabaseClient<Database>,
  input: {
    userId: string
    game: GameSlug
    mode: GameMode
    questionIds: string[]
    examRef?: string | null
    requestId?: string
    sourcePlanId?: string
  }
): Promise<VerifiedAttemptTicket> {
  // A TYT Social deneme is an official 20-question, policy-snapshotted
  // section. The generic practice issuer must never mint that artifact.
  const isGovernedTytSocial = isTytSocialV2LearnerEnabled()
    && input.game === 'sosyal'
    && input.examRef === 'TYT'
  if (isGovernedTytSocial && input.mode === 'deneme') {
    throw new Error('verified_attempt_issue_failed')
  }
  const dedupedIds = Array.from(new Set(input.questionIds))
  if (dedupedIds.length === 0 || dedupedIds.length > 100) {
    throw new Error('verified_attempt_issue_failed')
  }
  const durationSec = getVerifiedAttemptDurationSec(input.game, input.mode)
  try {
    const isTytSocial = isGovernedTytSocial
    const { data, error } = isTytSocial && input.sourcePlanId
      ? await admin.rpc('issue_verified_tyt_social_plan_attempt', {
          p_user_id: input.userId,
          p_plan_id: input.sourcePlanId,
          p_mode: input.mode,
          p_duration_sec: durationSec,
          p_request_id: input.requestId ?? crypto.randomUUID(),
        })
      : isTytSocial
        ? await admin.rpc('issue_verified_tyt_social_attempt', {
            p_user_id: input.userId,
            p_mode: input.mode,
            p_question_ids: dedupedIds,
            p_duration_sec: durationSec,
            p_request_id: input.requestId ?? crypto.randomUUID(),
          })
        : await admin.rpc('issue_verified_attempt', {
            p_user_id: input.userId,
            p_game: input.game,
            p_mode: input.mode,
            p_question_ids: dedupedIds,
            p_duration_sec: durationSec,
          })
    if (error) {
      throw new Error('verified_attempt_issue_failed')
    }
    const ticketSchema = z.object({
      attemptId: z.string().uuid(),
      expiresAt: z.string().datetime({ offset: true }),
      snapshot: normalSnapshotSchema,
      policyVersion: z.string().optional(),
      variant: z.enum(['questions_16_20', 'questions_21_25']).optional(),
      artifactKind: z.enum(['practice', 'daily_plan', 'smart_mock', 'official_section']).optional(),
      replayed: z.boolean().optional(),
    }).strict()
    const parsed = ticketSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error('verified_attempt_issue_failed')
    }
    if (Date.parse(parsed.data.expiresAt) <= Date.now()) {
      throw new Error('verified_attempt_issue_failed')
    }
    if (!snapshotsMatchNormalRequest(parsed.data.snapshot.items, dedupedIds, input.game)) {
      throw new Error('verified_attempt_issue_failed')
    }
    return withPrivateSnapshots(
      { attemptId: parsed.data.attemptId, expiresAt: parsed.data.expiresAt },
      parsed.data.snapshot.items,
    )
  } catch {
    throw new Error('verified_attempt_issue_failed')
  }
}

export async function issueVerifiedExamAttempt(
  admin: SupabaseClient<Database>,
  input: {
    userId: string
    game: GameSlug
    examRef: string | null
    blueprintVersion: string
    items: PersonalizedMockItem[]
    plannedDurationSec: number
    requestId: string
  },
): Promise<VerifiedExamAttemptTicket> {
  const durationSec = getVerifiedAttemptDurationSec(input.game, 'deneme')
  if (
    input.items.length !== 40
    || new Set(input.items.map(item => item.questionId)).size !== input.items.length
    || !Number.isInteger(input.plannedDurationSec)
    || input.plannedDurationSec < 1
    || durationSec <= input.plannedDurationSec
  ) throw new Error('verified_exam_attempt_issue_failed')

  const rpcItems = input.items.map((item, position) => ({
    position,
    questionId: item.questionId,
    sourceBucket: item.sourceBucket,
  }))
  const isGovernedTytSocial = isTytSocialV2LearnerEnabled()
    && input.game === 'sosyal'
    && input.examRef === 'TYT'
  const { data, error } = isGovernedTytSocial
    ? await admin.rpc('issue_verified_tyt_social_exam_attempt', {
        p_user_id: input.userId,
        p_blueprint_version: input.blueprintVersion,
        p_items: rpcItems,
        p_duration_sec: durationSec,
        p_planned_duration_sec: input.plannedDurationSec,
        p_request_id: input.requestId,
      })
    : await admin.rpc('issue_verified_exam_attempt', {
        p_user_id: input.userId,
        p_game: input.game,
        // PostgreSQL uses NULL as a first-class unscoped exam identity.
        p_exam_ref: input.examRef as string,
        p_blueprint_version: input.blueprintVersion,
        p_items: rpcItems,
        p_duration_sec: durationSec,
        p_planned_duration_sec: input.plannedDurationSec,
        p_request_id: input.requestId,
      })
  if (error) throw new Error('verified_exam_attempt_issue_failed')
  const parsed = z.object({
    attemptId: z.string().uuid(),
    expiresAt: z.string().datetime({ offset: true }),
    plannedDurationSec: z.number().int().positive(),
    status: z.enum(['issued', 'active']),
    replayed: z.boolean(),
    snapshot: examSnapshotSchema,
  }).strict().safeParse(data)
  if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) {
    throw new Error('verified_exam_attempt_issue_failed')
  }
  if (
    parsed.data.plannedDurationSec !== input.plannedDurationSec
    || !parsed.data.snapshot.items.every((snapshot, index) => (
      snapshot.position === index
      && snapshot.questionId === input.items[index]?.questionId
      && snapshot.sourceBucket === input.items[index]?.sourceBucket
      && snapshot.metadata.game === input.game
    ))
  ) throw new Error('verified_exam_attempt_issue_failed')
  return withPrivateSnapshots({
    attemptId: parsed.data.attemptId,
    expiresAt: parsed.data.expiresAt,
    strategyEligible: true as const,
    blueprintVersion: input.blueprintVersion,
  }, parsed.data.snapshot.items)
}

/**
 * Gecici altyapi kusurlari — hicbiri kullanicinin denemesiyle ilgili degil.
 * PGRST202 bunlarin en sinsisi: migration sonrasi PostgREST sema onbellegi
 * tazelenmediginde RPC "yok" gorunur, istek 500'e duser ve sebep loglanmadigi
 * icin teshis edilemez. Kod loga yazilir, istemciye sizmaz.
 */
const INFRA_ERROR_CODES = new Set([
  'PGRST202', // RPC sema onbelleginde bulunamadi -> NOTIFY pgrst, 'reload schema'
  'PGRST301', // JWT dogrulanamadi / suresi doldu
  '08003', '08006', // baglanti kopmasi
  '53300', // too_many_connections
  '57P03', // cannot_connect_now (DB aciliyor)
  '57014', // statement timeout
  '40001', '40P01', // serialization failure / deadlock — yeniden denenebilir
])

export async function readVerifiedAttemptQuestionSnapshots(
  admin: SupabaseClient<Database>,
  input: { attemptId: string; userId: string; requireActive?: boolean },
): Promise<readonly VerifiedQuestionSnapshot[]> {
  let result: { data: unknown; error: { code?: string } | null }
  try {
    // `admin.rpc` this'e bağımlıdır (gövdesi this.url/this.headers/this.fetch
    // kullanır). Referansı bağlamadan çıkarmak üretimde TypeError firlatir ve
    // istek hiç gönderilmeden asagidaki catch'e duserdi.
    const rpc = admin.rpc.bind(admin) as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string } | null }>
    result = await rpc('get_verified_attempt_question_snapshots', {
      p_attempt_id: input.attemptId,
      p_user_id: input.userId,
      p_require_active: input.requireActive ?? true,
    })
  } catch {
    throw new Error('verified_attempt_snapshot_read_failed')
  }
  if (result.error) {
    const code = result.error.code ?? ''
    if (['P0002', '42501', '22023'].includes(code)) {
      throw new Error('verified_attempt_snapshot_denied')
    }
    if (INFRA_ERROR_CODES.has(code)) {
      // Altyapi kusuru yetki reddi DEGILDIR: 403 vermek "denemen gecersiz" der ve
      // ogrenci ilerlemesini bosuna kaybettigini sanir. Ayri sinif olarak firlat;
      // cagiran 503 + Retry-After ile yeniden denenebilir oldugunu bildirir.
      throw Object.assign(new Error('verified_attempt_snapshot_unavailable'), { cause: code })
    }
    throw new Error('verified_attempt_snapshot_read_failed')
  }
  const parsed = normalSnapshotSchema.safeParse(result.data)
  if (!parsed.success) throw new Error('verified_attempt_snapshot_read_failed')
  return Object.freeze([...parsed.data.items])
}
