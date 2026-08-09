import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import type { TeacherAssignmentPublishInput } from './server-contract'
import { teacherInviteTokenSchema } from './server-contract'

const versionSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/)
const httpsUrlSchema = z.string().url().max(2_048).refine(
  (value) => new URL(value).protocol === 'https:',
  'legal document URL must use HTTPS',
)

const publicConfigSchema = z.object({
  noticeVersion: versionSchema,
  noticeHref: httpsUrlSchema,
  sharingConsentVersion: versionSchema,
  sharingConsentHref: httpsUrlSchema,
}).strict()

export interface TeacherClassroomServerConfig extends z.infer<typeof publicConfigSchema> {
  inviteSecret: string
}

export function getTeacherClassroomServerConfig(): TeacherClassroomServerConfig | null {
  if (process.env.TEACHER_CLASSROOM_ENABLED !== 'true') return null

  const inviteSecret = process.env.TEACHER_CLASSROOM_INVITE_SECRET ?? ''
  if (Buffer.byteLength(inviteSecret, 'utf8') < 32) return null

  const parsed = publicConfigSchema.safeParse({
    noticeVersion: process.env.TEACHER_CLASSROOM_NOTICE_VERSION,
    noticeHref: process.env.TEACHER_CLASSROOM_NOTICE_URL,
    sharingConsentVersion: process.env.TEACHER_CLASSROOM_CONSENT_VERSION,
    sharingConsentHref: process.env.TEACHER_CLASSROOM_CONSENT_URL,
  })
  return parsed.success ? { ...parsed.data, inviteSecret } : null
}

export function deriveTeacherInviteToken(input: {
  secret: string
  teacherId: string
  classroomId: string
  requestId: string
}): string {
  const token = createHmac('sha256', input.secret)
    .update(`${input.teacherId}:${input.classroomId}:${input.requestId}`, 'utf8')
    .digest('base64url')
  return teacherInviteTokenSchema.parse(token)
}

export function digestTeacherInviteToken(token: string): string {
  return createHash('sha256').update(teacherInviteTokenSchema.parse(token), 'utf8').digest('hex')
}

export function teacherInviteSharePath(token: string): string {
  return `/arena/sinif/davet#token=${teacherInviteTokenSchema.parse(token)}`
}

export function legalVersionsMatch(
  config: TeacherClassroomServerConfig,
  input: { noticeVersion: string; sharingConsentVersion: string },
): boolean {
  return input.noticeVersion === config.noticeVersion
    && input.sharingConsentVersion === config.sharingConsentVersion
}

const questionIdRowsSchema = z.array(z.object({ id: z.string().uuid() }).strict()).max(1_000)

/**
 * The browser sends only filters. Candidate IDs come from the active server-side
 * question query, then requestId gives a stable ordering for normal retries.
 * Migration 105 revalidates activity, content and answer bounds atomically.
 */
export function selectTeacherAssignmentQuestionIds(
  rows: unknown,
  input: Pick<TeacherAssignmentPublishInput, 'requestId' | 'questionCount'>,
): string[] | null {
  const parsed = questionIdRowsSchema.safeParse(rows)
  if (!parsed.success) return null
  const unique = Array.from(new Set(parsed.data.map((row) => row.id)))
  if (unique.length < input.questionCount) return null

  return unique
    .map((id) => ({
      id,
      rank: createHash('sha256').update(`${input.requestId}:${id}`, 'utf8').digest('hex'),
    }))
    .sort((left, right) => left.rank.localeCompare(right.rank) || left.id.localeCompare(right.id))
    .slice(0, input.questionCount)
    .map((entry) => entry.id)
}
