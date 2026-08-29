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
    studentCount: z.number().int().min(0).max(200),
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
  if (value.institution.studentCount > value.institution.studentLimit) {
    context.addIssue({ code: 'custom', message: 'institution student capacity mismatch' })
  }
  if (value.institution.staffCount > value.institution.staffLimit) {
    context.addIssue({ code: 'custom', message: 'institution staff capacity mismatch' })
  }
})

export type InstitutionPilotWorkspace = z.infer<typeof institutionPilotWorkspaceSchema>

export const institutionPilotTeacherAddInputSchema = z.object({
  teacherEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
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

export const institutionPilotManagerTeacherInputSchema = z.object({
  enabled: z.boolean(),
  requestId: uuidSchema,
}).strict()

export const institutionPilotManagerTeacherResultSchema = z.object({
  memberRef: memberRefSchema,
  enabled: z.boolean(),
  replayed: z.boolean(),
}).strict()

export const institutionPilotManagerTransferInputSchema = z.object({
  newManagerMemberRef: memberRefSchema,
  requestId: uuidSchema,
}).strict()

export const institutionPilotManagerTransferResultSchema = z.object({
  institutionId: uuidSchema,
  previousManagerRef: memberRefSchema,
  managerRef: memberRefSchema,
  replayed: z.boolean(),
}).strict().refine(
  (value) => value.previousManagerRef !== value.managerRef,
  { message: 'institution manager transfer must change the manager' },
)

export const institutionOperationEventTypeSchema = z.enum([
  'institution_provisioned',
  'staff_added',
  'staff_removed',
  'manager_teaching_changed',
  'manager_transferred',
  'role_created',
  'role_updated',
  'role_deleted',
  'role_assignment_changed',
  'classroom_created',
  'student_joined',
  'student_withdrawn',
  'student_removed',
])

export const institutionOperationEventsSchema = z.object({
  events: z.array(z.object({
    eventRef: memberRefSchema,
    eventType: institutionOperationEventTypeSchema,
    actorAlias: z.string().trim().min(1).max(80),
    subjectAlias: z.string().trim().min(1).max(80).nullable(),
    classroomName: z.string().trim().min(2).max(60).nullable(),
    createdAt: timestampSchema,
  }).strict()).max(100),
}).strict()

export type InstitutionOperationEvents = z.infer<typeof institutionOperationEventsSchema>

export function institutionPilotRpcStatus(code?: string): number {
  if (code === '55000') return 503
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
