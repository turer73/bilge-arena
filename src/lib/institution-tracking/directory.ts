import { z } from 'zod'

const timestampSchema = z.string().datetime({ offset: true })
const studentSchema = z.object({
  memberRef: z.string().regex(/^[0-9a-f]{32}$/),
  alias: z.string().trim().min(1).max(80),
  joinedAt: timestampSchema,
}).strict()

const classroomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  teacherAlias: z.string().trim().min(1).max(80),
  canAnalyze: z.boolean().optional(),
  activeStudentCount: z.number().int().min(0).max(40),
  students: z.array(studentSchema).max(40),
}).strict().superRefine((value, context) => {
  if (value.activeStudentCount !== value.students.length
    || new Set(value.students.map((student) => student.memberRef)).size !== value.students.length) {
    context.addIssue({ code: 'custom', message: 'classroom student directory mismatch' })
  }
})

export const institutionTrackingDirectorySchema = z.object({
  institution: z.object({
    name: z.string().trim().min(2).max(120),
    status: z.enum(['pilot', 'active']),
  }).strict(),
  membership: z.object({ role: z.enum(['manager', 'teacher']) }).strict(),
  classrooms: z.array(classroomSchema).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.classrooms.map((classroom) => classroom.id)).size !== value.classrooms.length) {
    context.addIssue({ code: 'custom', message: 'classroom directory ids must be unique' })
  }
})

export type InstitutionTrackingDirectory = z.infer<typeof institutionTrackingDirectorySchema>
