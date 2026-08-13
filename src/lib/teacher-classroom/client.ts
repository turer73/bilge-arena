import type { z } from 'zod'
import {
  studentAssignmentSubmitResponseSchema,
  studentTeacherAssignmentSchema,
  studentTeacherAssignmentsSchema,
  studentTeacherMembershipsSchema,
  teacherAssignmentPublishResultSchema,
  teacherClassroomCreateResultSchema,
  teacherClassroomListSchema,
  teacherClassroomOverviewSchema,
  classroomBilgeTahtaAccessSchema,
  classroomBilgeTahtaUpdateResultSchema,
  teacherInvitationAcceptResultSchema,
  teacherInvitationPreviewResponseSchema,
  teacherInviteIssueResponseSchema,
  teacherInviteRevokeResultSchema,
  teacherMemberRemoveResultSchema,
  teacherMembershipEndResultSchema,
  type StudentAssignmentSubmitInput,
  type StudentTeacherAssignment,
  type StudentTeacherAssignments,
  type StudentTeacherMemberships,
  type TeacherAssignmentPublishInput,
  type TeacherAssignmentPublishResult,
  type TeacherClassroomCreateInput,
  type TeacherClassroomCreateResult,
  type TeacherClassroomList,
  type TeacherClassroomOverview,
  type ClassroomBilgeTahtaAccess,
  type ClassroomBilgeTahtaUpdateInput,
  type TeacherInvitationAcceptInput,
  type TeacherInvitationAcceptResult,
  type TeacherInvitationPreview,
  type TeacherInviteIssueInput,
  type TeacherInviteIssueResponse,
  type TeacherMembershipEndResult,
  type TeacherMembershipRequest,
} from './server-contract'

export function isTeacherClassroomUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED === 'true'
}

export class TeacherClassroomClientError extends Error {
  constructor(readonly status: number) {
    super(`teacher_classroom_request_${status}`)
    this.name = 'TeacherClassroomClientError'
  }
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  })
  if (!response.ok) throw new TeacherClassroomClientError(response.status)
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new TeacherClassroomClientError(500)
  return parsed.data
}

export function fetchTeacherClassrooms(signal?: AbortSignal): Promise<TeacherClassroomList> {
  return requestJson('/api/teacher/classrooms', teacherClassroomListSchema, { signal })
}

export function createTeacherClassroom(
  input: TeacherClassroomCreateInput,
): Promise<TeacherClassroomCreateResult> {
  return requestJson('/api/teacher/classrooms', teacherClassroomCreateResultSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function fetchTeacherClassroomOverview(
  classroomId: string,
  signal?: AbortSignal,
): Promise<TeacherClassroomOverview> {
  return requestJson(
    `/api/teacher/classrooms/${encodeURIComponent(classroomId)}`,
    teacherClassroomOverviewSchema,
    { signal },
  )
}

export function fetchClassroomBilgeTahtaAccess(
  classroomId: string,
  signal?: AbortSignal,
): Promise<ClassroomBilgeTahtaAccess> {
  return requestJson(
    `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/bilge-tahta`,
    classroomBilgeTahtaAccessSchema,
    { signal },
  )
}

export function updateClassroomBilgeTahtaAccess(
  classroomId: string,
  input: ClassroomBilgeTahtaUpdateInput,
) {
  return requestJson(
    `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/bilge-tahta`,
    classroomBilgeTahtaUpdateResultSchema,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export function issueTeacherClassroomInvite(
  classroomId: string,
  input: TeacherInviteIssueInput,
): Promise<TeacherInviteIssueResponse> {
  return requestJson(
    `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/invites`,
    teacherInviteIssueResponseSchema,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function revokeTeacherClassroomInvite(inviteRef: string, input: TeacherMembershipRequest) {
  return requestJson(
    `/api/teacher/invites/${encodeURIComponent(inviteRef)}`,
    teacherInviteRevokeResultSchema,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function previewTeacherClassroomInvitation(
  token: string,
  signal?: AbortSignal,
): Promise<TeacherInvitationPreview> {
  return requestJson('/api/teacher/invitations/preview', teacherInvitationPreviewResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ token }),
    signal,
  })
}

export function acceptTeacherClassroomInvitation(
  input: TeacherInvitationAcceptInput,
): Promise<TeacherInvitationAcceptResult> {
  return requestJson('/api/teacher/invitations/accept', teacherInvitationAcceptResultSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function fetchStudentTeacherMemberships(
  signal?: AbortSignal,
): Promise<StudentTeacherMemberships> {
  return requestJson('/api/teacher/memberships', studentTeacherMembershipsSchema, { signal })
}

export function withdrawTeacherClassroom(
  classroomId: string,
  input: TeacherMembershipRequest,
): Promise<TeacherMembershipEndResult> {
  return requestJson(
    `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/withdraw`,
    teacherMembershipEndResultSchema,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function removeTeacherClassroomMember(
  classroomId: string,
  memberRef: string,
  input: TeacherMembershipRequest,
) {
  return requestJson(
    `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/members/${encodeURIComponent(memberRef)}/remove`,
    teacherMemberRemoveResultSchema,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function publishTeacherAssignment(
  classroomId: string,
  input: TeacherAssignmentPublishInput,
): Promise<TeacherAssignmentPublishResult> {
  return requestJson(
    `/api/teacher/classrooms/${encodeURIComponent(classroomId)}/assignments`,
    teacherAssignmentPublishResultSchema,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function fetchStudentTeacherAssignments(
  signal?: AbortSignal,
): Promise<StudentTeacherAssignments> {
  return requestJson('/api/teacher/assignments', studentTeacherAssignmentsSchema, { signal })
}

export function fetchStudentTeacherAssignment(
  assignmentId: string,
  signal?: AbortSignal,
): Promise<StudentTeacherAssignment> {
  return requestJson(
    `/api/teacher/assignments/${encodeURIComponent(assignmentId)}`,
    studentTeacherAssignmentSchema,
    { signal },
  )
}

export function submitStudentTeacherAssignment(
  assignmentId: string,
  input: StudentAssignmentSubmitInput,
  signal?: AbortSignal,
) {
  return requestJson(
    `/api/teacher/assignments/${encodeURIComponent(assignmentId)}`,
    studentAssignmentSubmitResponseSchema,
    { method: 'POST', body: JSON.stringify(input), signal },
  )
}
