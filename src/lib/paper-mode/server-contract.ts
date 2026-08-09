import { z } from 'zod'

const uuidSchema = z.string().uuid()
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoTimestampSchema = z.string().datetime({ offset: true })
const gameSchema = z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal'])
const examRefSchema = z.enum(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ']).nullable()

export const paperPackCreateInputSchema = z.object({
  game: gameSchema,
  examRef: examRefSchema,
  requestId: uuidSchema,
}).strict()

export const paperPackIssueResultSchema = z.object({
  packId: uuidSchema,
  status: z.enum(['active', 'submitted', 'expired']),
  createdAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  itemCount: z.number().int().min(1).max(15),
  replayed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    context.addIssue({ code: 'custom', message: 'paper pack expiry mismatch' })
  }
})

const publicPaperQuestionContentSchema = z.object({
  question: z.string().trim().min(1).max(20_000),
  options: z.array(z.string().max(10_000)).min(2).max(10),
  sentence: z.string().max(20_000).optional(),
  passage: z.string().max(50_000).optional(),
  context: z.string().max(20_000).optional(),
  type: z.string().max(80).optional(),
}).strict()

const paperPackItemSchema = z.object({
  position: z.number().int().min(1).max(15),
  question: z.object({
    id: uuidSchema,
    game: gameSchema,
    category: z.string().max(120).nullable(),
    topic: z.string().max(200).nullable(),
    difficulty: z.number().int().min(1).max(5),
    content: publicPaperQuestionContentSchema,
  }).strict(),
  selectedOption: z.number().int().nonnegative().max(9).nullable(),
  isCorrect: z.boolean().nullable(),
  correctOption: z.number().int().nonnegative().max(9).nullable(),
}).strict()

const paperPackSummarySchema = z.object({
  answeredCount: z.number().int().min(0).max(15),
  correctCount: z.number().int().min(0).max(15),
  scorePercent: z.number().int().min(0).max(100),
}).strict().superRefine((value, context) => {
  const expected = value.answeredCount === 0
    ? 0
    : Math.floor((value.correctCount * 100) / value.answeredCount)
  if (value.correctCount > value.answeredCount || value.scorePercent !== expected) {
    context.addIssue({ code: 'custom', message: 'paper pack summary mismatch' })
  }
})

export const paperPackViewSchema = z.object({
  packId: uuidSchema,
  status: z.enum(['active', 'submitted', 'expired']),
  createdAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  submittedAt: isoTimestampSchema.nullable(),
  plan: z.object({
    game: gameSchema,
    planDate: isoDateSchema,
    examRef: examRefSchema,
  }).strict(),
  items: z.array(paperPackItemSchema).min(1).max(15),
  summary: paperPackSummarySchema.nullable(),
  mastery: z.object({
    source: z.literal('paper'),
    weight: z.literal(0.5),
  }).strict(),
  reward: z.object({
    xp: z.literal(0),
    coins: z.literal(0),
    socialPoints: z.literal(0),
  }).strict(),
  privacy: z.object({
    ownerOnly: z.literal(true),
    privateCacheDisabled: z.literal(true),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    context.addIssue({ code: 'custom', message: 'paper pack expiry mismatch' })
  }

  const positions = value.items.map((item) => item.position)
  const questionIds = value.items.map((item) => item.question.id)
  if (positions.some((position, index) => position !== index + 1)
    || new Set(questionIds).size !== questionIds.length) {
    context.addIssue({ code: 'custom', message: 'paper pack item order mismatch' })
  }

  const submitted = value.status === 'submitted'
  if (submitted !== (value.submittedAt !== null && value.summary !== null)) {
    context.addIssue({ code: 'custom', message: 'paper pack submission state mismatch' })
  }

  let answeredCount = 0
  let correctCount = 0
  for (const item of value.items) {
    const optionCount = item.question.content.options.length
    if (item.question.game !== value.plan.game
      || (item.selectedOption !== null && item.selectedOption >= optionCount)
      || (item.correctOption !== null && item.correctOption >= optionCount)) {
      context.addIssue({ code: 'custom', message: 'paper pack question invariant mismatch' })
    }

    if (!submitted) {
      if (item.selectedOption !== null || item.isCorrect !== null || item.correctOption !== null) {
        context.addIssue({ code: 'custom', message: 'active paper pack leaked answer state' })
      }
      continue
    }

    if (item.correctOption === null) {
      context.addIssue({ code: 'custom', message: 'submitted paper pack requires answer key' })
      continue
    }
    if (item.selectedOption === null) {
      if (item.isCorrect !== null) {
        context.addIssue({ code: 'custom', message: 'blank paper answer cannot be graded' })
      }
      continue
    }
    answeredCount += 1
    const isCorrect = item.selectedOption === item.correctOption
    if (item.isCorrect !== isCorrect) {
      context.addIssue({ code: 'custom', message: 'paper answer grading mismatch' })
    }
    if (isCorrect) correctCount += 1
  }

  if (submitted && value.summary
    && (value.summary.answeredCount !== answeredCount
      || value.summary.correctCount !== correctCount)) {
    context.addIssue({ code: 'custom', message: 'paper pack item/summary mismatch' })
  }
})

export const paperPackSubmitInputSchema = z.object({
  requestId: uuidSchema,
  answers: z.array(z.object({
    position: z.number().int().min(1).max(15),
    selectedOption: z.number().int().nonnegative().max(9).nullable(),
  }).strict()).min(1).max(15),
}).strict().superRefine((value, context) => {
  if (new Set(value.answers.map((answer) => answer.position)).size !== value.answers.length) {
    context.addIssue({ code: 'custom', message: 'paper answer positions must be unique' })
  }
})

export const paperPackSubmitReceiptSchema = z.object({
  packId: uuidSchema,
  summary: paperPackSummarySchema,
  replayed: z.boolean(),
}).strict()

export const paperPackSubmitResponseSchema = z.object({
  pack: paperPackViewSchema,
  replayed: z.boolean(),
}).strict()

export type PaperPackIssueResult = z.infer<typeof paperPackIssueResultSchema>
export type PaperPackView = z.infer<typeof paperPackViewSchema>
export type PaperPackSubmitInput = z.infer<typeof paperPackSubmitInputSchema>

export type PaperPackRpcAnswer = {
  questionId: string
  selectedOptionIndex: number | null
}

/**
 * The public form is position based so a browser can never choose a question
 * identifier. The server resolves positions against the owner-scoped pack and
 * emits the private RPC contract in a deterministic order for idempotency.
 */
export function buildPaperPackRpcAnswers(
  pack: PaperPackView,
  input: PaperPackSubmitInput,
): PaperPackRpcAnswer[] | null {
  if (input.answers.length !== pack.items.length) return null

  const byPosition = new Map(input.answers.map((answer) => [answer.position, answer]))
  if (byPosition.size !== pack.items.length) return null

  const answers: PaperPackRpcAnswer[] = []
  for (const item of pack.items) {
    const answer = byPosition.get(item.position)
    if (!answer) return null
    if (
      answer.selectedOption !== null
      && answer.selectedOption >= item.question.content.options.length
    ) return null

    answers.push({
      questionId: item.question.id,
      selectedOptionIndex: answer.selectedOption,
    })
  }
  return answers
}

export function paperPackRpcStatus(code?: string): number {
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === '22023' || code === '23505' || code === '23514' || code === 'P0001') {
    return 409
  }
  return 500
}

export function privateNoStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): Response {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'private, no-store')
  return Response.json(body, { ...init, headers })
}
