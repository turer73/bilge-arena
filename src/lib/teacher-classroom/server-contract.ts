import { z } from 'zod'

const uuidSchema = z.string().uuid()
const timestampSchema = z.string().datetime({ offset: true })
const memberRefSchema = z.string().regex(/^[0-9a-f]{32}$/)
const inviteRefSchema = z.string().regex(/^[0-9a-f]{32}$/)
export const teacherInviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const versionSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/)
const aliasSchema = z.string().trim().min(1).max(80)

export const teacherClassroomGameSchema = z.enum([
  'wordquest',
  'matematik',
  'turkce',
  'fen',
  'sosyal',
])
export const teacherClassroomExamRefSchema = z.enum([
  'TYT',
  'LGS',
  'AYT-SAY',
  'AYT-EA',
  'AYT-SOZ',
  'YDT',
]).nullable()

const classroomStatusSchema = z.enum(['active', 'archived'])
const assignmentStatusSchema = z.enum([
  'active',
  'upcoming',
  'submitted',
  'expired',
  'closed',
  'cancelled',
])

const classroomSummarySchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(2).max(60),
  status: classroomStatusSchema,
  activeStudentCount: z.number().int().min(0).max(40),
  assignmentCount: z.number().int().nonnegative().max(10_000),
  createdAt: timestampSchema,
}).strict()

export const teacherClassroomListSchema = z.object({
  classrooms: z.array(classroomSummarySchema).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.classrooms.map((classroom) => classroom.id)).size !== value.classrooms.length) {
    context.addIssue({ code: 'custom', message: 'classroom ids must be unique' })
  }
})

export const teacherClassroomCreateInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  requestId: uuidSchema,
}).strict()

export const teacherClassroomCreateResultSchema = z.object({
  classroom: z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(60),
    status: classroomStatusSchema,
    createdAt: timestampSchema,
  }).strict(),
  replayed: z.boolean(),
}).strict()

export const classroomBilgeTahtaAccessSchema = z.object({
  enabled: z.boolean(),
}).strict()

export const classroomBilgeTahtaUpdateInputSchema = z.object({
  enabled: z.boolean(),
  requestId: uuidSchema,
}).strict()

export const classroomBilgeTahtaUpdateResultSchema = z.object({
  classroomId: uuidSchema,
  enabled: z.boolean(),
  replayed: z.boolean(),
}).strict()

export const teacherInviteIssueInputSchema = z.object({
  expiresAt: timestampSchema,
  maxUses: z.number().int().min(1).max(40),
  requestId: uuidSchema,
}).strict().superRefine((value, context) => {
  const ttl = Date.parse(value.expiresAt) - Date.now()
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 168 * 60 * 60 * 1000) {
    context.addIssue({ code: 'custom', message: 'invite expiry must be within seven days' })
  }
})

export const teacherInviteIssueRpcResultSchema = z.object({
  inviteRef: inviteRefSchema,
  expiresAt: timestampSchema,
  maxUses: z.number().int().min(1).max(40),
  usedCount: z.number().int().min(0).max(40),
  replayed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.usedCount > value.maxUses) {
    context.addIssue({ code: 'custom', message: 'invite use count mismatch' })
  }
})

export const teacherInviteIssueResponseSchema = teacherInviteIssueRpcResultSchema.extend({
  token: teacherInviteTokenSchema,
  sharePath: z.string().regex(/^\/arena\/sinif\/davet#token=[A-Za-z0-9_-]{43}$/),
}).strict()

export const teacherInviteRevokeInputSchema = z.object({ requestId: uuidSchema }).strict()
export const teacherInviteRevokeResultSchema = z.object({
  inviteRef: inviteRefSchema,
  revokedAt: timestampSchema,
  replayed: z.boolean(),
}).strict()

export const teacherInvitationPreviewInputSchema = z.object({
  token: teacherInviteTokenSchema,
}).strict()

export const teacherInvitationPreviewRpcSchema = z.object({
  classroomName: z.string().trim().min(2).max(60),
  teacherAlias: aliasSchema,
  expiresAt: timestampSchema,
}).strict()

const legalDocumentSchema = z.object({
  version: versionSchema,
  href: z.string().url().max(2_048).refine((value) => new URL(value).protocol === 'https:', {
    message: 'legal document URL must use HTTPS',
  }),
}).strict()

export const teacherInvitationPreviewResponseSchema = teacherInvitationPreviewRpcSchema.extend({
  notice: legalDocumentSchema,
  sharingConsent: legalDocumentSchema,
}).strict()

export const teacherInvitationAcceptInputSchema = z.object({
  token: teacherInviteTokenSchema,
  noticeVersion: versionSchema,
  noticeAcknowledged: z.literal(true),
  sharingConsentVersion: versionSchema,
  sharingConsent: z.literal(true),
  requestId: uuidSchema,
}).strict()

export const teacherInvitationAcceptResultSchema = z.object({
  classroom: z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(60),
    teacherAlias: aliasSchema,
  }).strict(),
  membershipStatus: z.literal('active'),
  joinedAt: timestampSchema,
  replayed: z.boolean(),
}).strict()

export const studentTeacherMembershipsSchema = z.object({
  classrooms: z.array(z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(60),
    teacherAlias: aliasSchema,
    joinedAt: timestampSchema,
  }).strict()).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.classrooms.map((classroom) => classroom.id)).size !== value.classrooms.length) {
    context.addIssue({ code: 'custom', message: 'membership classroom ids must be unique' })
  }
})

export const teacherMembershipRequestSchema = z.object({ requestId: uuidSchema }).strict()

export const teacherMembershipEndResultSchema = z.object({
  classroomId: uuidSchema,
  membershipStatus: z.enum(['withdrawn', 'removed']),
  endedAt: timestampSchema,
  replayed: z.boolean(),
}).strict()

export const teacherMemberRemoveResultSchema = teacherMembershipEndResultSchema.extend({
  memberRef: memberRefSchema,
}).strict()

export const teacherAssignmentPublishInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  game: teacherClassroomGameSchema,
  examRef: teacherClassroomExamRefSchema,
  category: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  questionCount: z.number().int().min(1).max(30),
  availableAt: timestampSchema,
  dueAt: timestampSchema,
  requestId: uuidSchema,
}).strict().superRefine((value, context) => {
  if ((value.game === 'wordquest') !== (value.examRef === null)) {
    context.addIssue({ code: 'custom', message: 'game and exam reference mismatch' })
  }
  const available = Date.parse(value.availableAt)
  const due = Date.parse(value.dueAt)
  if (!Number.isFinite(available) || !Number.isFinite(due)
    || due <= available || due > available + 30 * 24 * 60 * 60 * 1000
    || due <= Date.now()) {
    context.addIssue({ code: 'custom', message: 'assignment time window mismatch' })
  }
})

export const teacherAssignmentPublishResultSchema = z.object({
  assignmentId: uuidSchema,
  status: z.literal('published'),
  availableAt: timestampSchema,
  dueAt: timestampSchema,
  questionCount: z.number().int().min(1).max(30),
  recipientCount: z.number().int().min(1).max(40),
  replayed: z.boolean(),
}).strict()

const activeStudentSchema = z.object({
  memberRef: memberRefSchema,
  alias: aliasSchema,
  joinedAt: timestampSchema,
}).strict()

const teacherAssignmentStudentSchema = z.object({
  memberRef: memberRefSchema,
  alias: aliasSchema,
  status: z.enum(['assigned', 'submitted']),
  answeredCount: z.number().int().min(0).max(30),
  correctCount: z.number().int().min(0).max(30),
  submittedAt: timestampSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.correctCount > value.answeredCount
    || (value.status === 'submitted') !== (value.submittedAt !== null)
    || (value.status === 'assigned' && (value.answeredCount !== 0 || value.correctCount !== 0))) {
    context.addIssue({ code: 'custom', message: 'teacher student summary mismatch' })
  }
})

const teacherAssignmentSummarySchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(160),
  status: z.enum(['published', 'closed', 'cancelled']),
  availableAt: timestampSchema,
  dueAt: timestampSchema,
  questionCount: z.number().int().min(1).max(30),
  assignedCount: z.number().int().min(1).max(40),
  submittedCount: z.number().int().min(0).max(40),
  students: z.array(teacherAssignmentStudentSchema).max(40),
}).strict().superRefine((value, context) => {
  const visibleSubmitted = value.students.filter((student) => student.status === 'submitted').length
  if (value.submittedCount > value.assignedCount
    || value.students.length > value.assignedCount
    || visibleSubmitted !== value.submittedCount
    || new Set(value.students.map((student) => student.memberRef)).size !== value.students.length) {
    context.addIssue({ code: 'custom', message: 'teacher assignment aggregate mismatch' })
  }
})

export const teacherClassroomOverviewSchema = z.object({
  classroom: z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(60),
    status: classroomStatusSchema,
    activeStudentCount: z.number().int().min(0).max(40),
    hiddenRecipientCount: z.number().int().nonnegative().max(100_000),
    createdAt: timestampSchema,
  }).strict(),
  activeStudents: z.array(activeStudentSchema).max(40),
  assignments: z.array(teacherAssignmentSummarySchema).max(1_000),
}).strict().superRefine((value, context) => {
  if (value.classroom.activeStudentCount !== value.activeStudents.length
    || new Set(value.activeStudents.map((student) => student.memberRef)).size !== value.activeStudents.length
    || new Set(value.assignments.map((assignment) => assignment.id)).size !== value.assignments.length) {
    context.addIssue({ code: 'custom', message: 'classroom overview mismatch' })
  }
})

const studentClassroomSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(2).max(60),
  teacherAlias: aliasSchema,
}).strict()

const studentAssignmentListItemSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(160),
  status: assignmentStatusSchema,
  availableAt: timestampSchema,
  dueAt: timestampSchema,
  questionCount: z.number().int().min(1).max(30),
  submittedAt: timestampSchema.nullable(),
  classroom: studentClassroomSchema,
}).strict().superRefine((value, context) => {
  const mayHaveSubmission = value.status === 'submitted'
    || value.status === 'closed'
    || value.status === 'cancelled'
  if ((value.status === 'submitted' && value.submittedAt === null)
    || (!mayHaveSubmission && value.submittedAt !== null)) {
    context.addIssue({ code: 'custom', message: 'student assignment status mismatch' })
  }
})

export const studentTeacherAssignmentsSchema = z.object({
  assignments: z.array(studentAssignmentListItemSchema).max(1_000),
}).strict().superRefine((value, context) => {
  if (new Set(value.assignments.map((assignment) => assignment.id)).size !== value.assignments.length) {
    context.addIssue({ code: 'custom', message: 'student assignment ids must be unique' })
  }
})

const publicQuestionContentSchema = z.object({
  question: z.string().trim().min(1).max(20_000),
  options: z.array(z.string().max(10_000)).min(2).max(10),
  sentence: z.string().max(20_000).optional(),
  passage: z.string().max(50_000).optional(),
  context: z.string().max(20_000).optional(),
  type: z.string().max(80).optional(),
}).strict()

const studentAssignmentItemSchema = z.object({
  position: z.number().int().min(1).max(30),
  question: z.object({
    game: teacherClassroomGameSchema,
    category: z.string().max(120).nullable(),
    topic: z.string().max(200).nullable(),
    difficulty: z.number().int().min(1).max(5),
    content: publicQuestionContentSchema,
  }).strict(),
}).strict()

const studentAssignmentResultItemSchema = z.object({
  position: z.number().int().min(1).max(30),
  selectedOption: z.number().int().min(0).max(9).nullable(),
  isCorrect: z.boolean().nullable(),
  correctOption: z.number().int().min(0).max(9),
}).strict()

const studentAssignmentResultSchema = z.object({
  answeredCount: z.number().int().min(0).max(30),
  correctCount: z.number().int().min(0).max(30),
  items: z.array(studentAssignmentResultItemSchema).min(1).max(30),
}).strict()

export const studentTeacherAssignmentSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1).max(160),
  status: assignmentStatusSchema.exclude(['upcoming']),
  availableAt: timestampSchema,
  dueAt: timestampSchema,
  classroom: studentClassroomSchema,
  items: z.array(studentAssignmentItemSchema).min(1).max(30),
  result: studentAssignmentResultSchema.nullable(),
  reward: z.object({
    xp: z.literal(0),
    coins: z.literal(0),
    socialPoints: z.literal(0),
  }).strict(),
}).strict().superRefine((value, context) => {
  const positions = value.items.map((item) => item.position)
  if (positions.some((position, index) => position !== index + 1)) {
    context.addIssue({ code: 'custom', message: 'assignment positions must be contiguous' })
  }
  if (value.result) {
    if (value.result.items.length !== value.items.length
      || value.result.items.some((item, index) => item.position !== value.items[index]?.position)) {
      context.addIssue({ code: 'custom', message: 'assignment result positions mismatch' })
      return
    }
    let answered = 0
    let correct = 0
    for (const [index, resultItem] of value.result.items.entries()) {
      const optionCount = value.items[index]!.question.content.options.length
      if (resultItem.correctOption >= optionCount
        || (resultItem.selectedOption !== null && resultItem.selectedOption >= optionCount)
        || (resultItem.selectedOption === null) !== (resultItem.isCorrect === null)) {
        context.addIssue({ code: 'custom', message: 'assignment result option mismatch' })
      }
      if (resultItem.selectedOption !== null) {
        answered += 1
        const isCorrect = resultItem.selectedOption === resultItem.correctOption
        if (resultItem.isCorrect !== isCorrect) {
          context.addIssue({ code: 'custom', message: 'assignment grading mismatch' })
        }
        if (isCorrect) correct += 1
      }
    }
    if (value.result.answeredCount !== answered || value.result.correctCount !== correct) {
      context.addIssue({ code: 'custom', message: 'assignment aggregate mismatch' })
    }
  } else if (value.status === 'submitted') {
    context.addIssue({ code: 'custom', message: 'submitted assignment requires a result' })
  }
})

export const studentAssignmentSubmitInputSchema = z.object({
  requestId: uuidSchema,
  answers: z.array(z.object({
    position: z.number().int().min(1).max(30),
    selectedOption: z.number().int().min(0).max(9).nullable(),
  }).strict()).min(1).max(30),
}).strict().superRefine((value, context) => {
  if (new Set(value.answers.map((answer) => answer.position)).size !== value.answers.length) {
    context.addIssue({ code: 'custom', message: 'answer positions must be unique' })
  }
})

export const studentAssignmentSubmitReceiptSchema = z.object({
  assignmentId: uuidSchema,
  answeredCount: z.number().int().min(0).max(30),
  correctCount: z.number().int().min(0).max(30),
  replayed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.correctCount > value.answeredCount) {
    context.addIssue({ code: 'custom', message: 'submission receipt mismatch' })
  }
})

export const studentAssignmentSubmitResponseSchema = z.object({
  assignment: studentTeacherAssignmentSchema,
  replayed: z.boolean(),
}).strict()

export type TeacherClassroomList = z.infer<typeof teacherClassroomListSchema>
export type TeacherClassroomOverview = z.infer<typeof teacherClassroomOverviewSchema>
export type TeacherClassroomCreateInput = z.infer<typeof teacherClassroomCreateInputSchema>
export type TeacherClassroomCreateResult = z.infer<typeof teacherClassroomCreateResultSchema>
export type ClassroomBilgeTahtaAccess = z.infer<typeof classroomBilgeTahtaAccessSchema>
export type ClassroomBilgeTahtaUpdateInput = z.infer<typeof classroomBilgeTahtaUpdateInputSchema>
export type TeacherInviteIssueInput = z.infer<typeof teacherInviteIssueInputSchema>
export type TeacherInviteIssueResponse = z.infer<typeof teacherInviteIssueResponseSchema>
export type TeacherInvitationPreview = z.infer<typeof teacherInvitationPreviewResponseSchema>
export type TeacherInvitationAcceptInput = z.infer<typeof teacherInvitationAcceptInputSchema>
export type TeacherInvitationAcceptResult = z.infer<typeof teacherInvitationAcceptResultSchema>
export type TeacherMembershipRequest = z.infer<typeof teacherMembershipRequestSchema>
export type TeacherMembershipEndResult = z.infer<typeof teacherMembershipEndResultSchema>
export type TeacherAssignmentPublishInput = z.infer<typeof teacherAssignmentPublishInputSchema>
export type TeacherAssignmentPublishResult = z.infer<typeof teacherAssignmentPublishResultSchema>
export type StudentTeacherAssignments = z.infer<typeof studentTeacherAssignmentsSchema>
export type StudentTeacherMemberships = z.infer<typeof studentTeacherMembershipsSchema>
export type StudentTeacherAssignment = z.infer<typeof studentTeacherAssignmentSchema>
export type StudentAssignmentSubmitInput = z.infer<typeof studentAssignmentSubmitInputSchema>

export function teacherClassroomRpcStatus(code?: string): number {
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === 'P0003' || code === '22023' || code === '23505' || code === '23514') return 409
  return 500
}

export function teacherInviteRpcStatus(code?: string): number {
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === 'P0003') return 410
  if (code === '22023' || code === '23505' || code === '23514') return 409
  return 500
}

export function teacherClassroomNoStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): Response {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  return Response.json(body, { ...init, headers })
}
