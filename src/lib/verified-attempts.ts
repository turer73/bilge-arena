import 'server-only'
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

export async function issueVerifiedAttempt(
  admin: SupabaseClient<Database>,
  input: {
    userId: string
    game: GameSlug
    mode: GameMode
    questionIds: string[]
  }
): Promise<VerifiedAttemptTicket> {
  const dedupedIds = Array.from(new Set(input.questionIds))
  if (dedupedIds.length === 0 || dedupedIds.length > 100) {
    throw new Error('verified_attempt_issue_failed')
  }
  const durationSec = getVerifiedAttemptDurationSec(input.game, input.mode)
  try {
    const { data, error } = await admin.rpc('issue_verified_attempt', {
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

  const { data, error } = await admin.rpc('issue_verified_exam_attempt', {
    p_user_id: input.userId,
    p_game: input.game,
    p_exam_ref: input.examRef,
    p_blueprint_version: input.blueprintVersion,
    p_items: input.items.map((item, position) => ({
      position,
      questionId: item.questionId,
      sourceBucket: item.sourceBucket,
    })),
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

export async function readVerifiedAttemptQuestionSnapshots(
  admin: SupabaseClient<Database>,
  input: { attemptId: string; userId: string; requireActive?: boolean },
): Promise<readonly VerifiedQuestionSnapshot[]> {
  let result: { data: unknown; error: { code?: string } | null }
  try {
    const rpc = admin.rpc as unknown as (
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
    if (['P0002', '42501', '22023'].includes(result.error.code ?? '')) {
      throw new Error('verified_attempt_snapshot_denied')
    }
    throw new Error('verified_attempt_snapshot_read_failed')
  }
  const parsed = normalSnapshotSchema.safeParse(result.data)
  if (!parsed.success) throw new Error('verified_attempt_snapshot_read_failed')
  return Object.freeze([...parsed.data.items])
}
