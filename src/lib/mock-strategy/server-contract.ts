import { z } from 'zod'

export const mockStrategyStartResultSchema = z.object({
  attemptId: z.string().uuid(),
  status: z.literal('active'),
  startedAt: z.string().datetime({ offset: true }),
  deadlineAt: z.string().datetime({ offset: true }),
  experiment: z.object({
    key: z.literal('mock_strategy_analysis_v1'),
    revision: z.number().int().positive(),
    variant: z.enum(['control', 'treatment']),
  }).strict().nullable(),
  replayed: z.boolean(),
}).strict()

const evidenceItemSchema = z.object({
  position: z.number().int().min(0).max(99),
  answered: z.boolean(),
  isCorrect: z.boolean().nullable(),
  isSkipped: z.boolean(),
  openedAt: z.string().datetime({ offset: true }).nullable(),
  submittedAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

export const mockStrategyEvidenceResultSchema = z.object({
  experimentKey: z.literal('mock_strategy_analysis_v1'),
  revision: z.number().int().positive(),
  variant: z.enum(['control', 'treatment']),
  plannedCount: z.number().int().min(1).max(100),
  startedAt: z.string().datetime({ offset: true }),
  deadlineAt: z.string().datetime({ offset: true }),
  items: z.array(evidenceItemSchema).max(100),
}).strict().superRefine((value, context) => {
  if (value.variant === 'control' && value.items.length !== 0) {
    context.addIssue({ code: 'custom', message: 'control evidence must be empty' })
  }
})

export function mockStrategyRpcStatus(code?: string): number {
  if (code === '42501') return 403
  if (code === '22023' || code === '23514' || code === '23505' || code === 'P0001') return 409
  return 500
}

export function mockStrategyNoStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): Response {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return Response.json(body, { ...init, headers })
}
