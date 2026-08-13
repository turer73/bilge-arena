import { z } from 'zod'

const uuidSchema = z.string().uuid()
const timestampSchema = z.string().datetime({ offset: true })
const memberRefSchema = z.string().regex(/^[0-9a-f]{32}$/)

export const institutionPilotWorkspaceSchema = z.object({
  institution: z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(120),
    status: z.enum(['pilot', 'active']),
    studentLimit: z.number().int().min(1).max(200),
    staffLimit: z.number().int().min(1).max(6),
    staffCount: z.number().int().min(1).max(6),
    createdAt: timestampSchema,
  }).strict(),
  membership: z.object({
    memberRef: memberRefSchema,
    role: z.enum(['manager', 'teacher']),
    joinedAt: timestampSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.institution.staffCount > value.institution.staffLimit) {
    context.addIssue({ code: 'custom', message: 'institution staff capacity mismatch' })
  }
})

export type InstitutionPilotWorkspace = z.infer<typeof institutionPilotWorkspaceSchema>

export const institutionPilotTeacherAddInputSchema = z.object({
  teacherUserId: uuidSchema,
  requestId: uuidSchema,
}).strict()

export const institutionPilotTeacherAddResultSchema = z.object({
  institutionId: uuidSchema,
  memberRef: memberRefSchema,
  role: z.literal('teacher'),
  joinedAt: timestampSchema,
  replayed: z.boolean(),
}).strict()

export const institutionPilotTeacherRemoveInputSchema = z.object({
  requestId: uuidSchema,
}).strict()

export const institutionPilotTeacherRemoveResultSchema = z.object({
  institutionId: uuidSchema,
  memberRef: memberRefSchema,
  status: z.literal('removed'),
  endedAt: timestampSchema,
  replayed: z.boolean(),
}).strict()

export function institutionPilotRpcStatus(code?: string): number {
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === 'P0003' || code === '22023' || code === '23505' || code === '23514') return 409
  return 500
}

export function institutionPilotNoStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): Response {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  return Response.json(body, { ...init, headers })
}
