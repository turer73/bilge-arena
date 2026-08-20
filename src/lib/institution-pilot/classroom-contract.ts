import { z } from 'zod'

const memberRefSchema = z.string().regex(/^[0-9a-f]{32}$/)
const timestampSchema = z.string().datetime({ offset: true })

export const institutionClassroomCreateInputSchema = z.object({
  teacherMemberRef: memberRefSchema,
  name: z.string().trim().min(2).max(60),
  requestId: z.string().uuid(),
}).strict()

export const institutionClassroomCreateResultSchema = z.object({
  classroom: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(60),
    status: z.enum(['active', 'archived']),
    createdAt: timestampSchema,
  }).strict(),
  teacher: z.object({
    memberRef: memberRefSchema,
    alias: z.string().trim().min(1).max(80),
  }).strict(),
  replayed: z.boolean(),
}).strict()

export type InstitutionClassroomCreateResult = z.infer<typeof institutionClassroomCreateResultSchema>
