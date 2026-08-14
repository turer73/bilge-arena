import { z } from 'zod'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timestampSchema = z.string().datetime({ offset: true })
const itemSchema = z.object({
  position: z.number().int().min(1).max(21),
  scheduledDate: dateSchema,
  taskType: z.enum(['verified_questions', 'fsrs_review', 'diagnostic', 'paper_pack']),
  title: z.string().trim().min(2).max(120),
  reasonCode: z.enum(['weak_outcome', 'due_review', 'diagnostic_gap', 'current_target', 'challenge']),
  outcomeCode: z.string().trim().min(1).max(120).nullable(),
  durationMinutes: z.number().int().min(5).max(60),
  targetQuestionCount: z.number().int().min(1).max(50).nullable(),
  status: z.enum(['pending', 'completed', 'skipped']),
}).strict()

const programSchema = z.object({
  classroomName: z.string().trim().min(2).max(60),
  teacherAlias: z.string().trim().min(1).max(80),
  weekStart: dateSchema,
  dailyMinuteLimit: z.number().int().min(20).max(120),
  modelVersion: z.literal('institution-program-v1'),
  publishedAt: timestampSchema,
  items: z.array(itemSchema).min(1).max(21),
}).strict().superRefine((value, context) => {
  if (value.items.some((item, index) => item.position !== index + 1)) {
    context.addIssue({ code: 'custom', message: 'student program item order mismatch' })
  }
})

export const institutionStudentProgramsSchema = z.object({
  asOfDate: dateSchema,
  programs: z.array(programSchema).max(20),
}).strict()

export type InstitutionStudentPrograms = z.infer<typeof institutionStudentProgramsSchema>
