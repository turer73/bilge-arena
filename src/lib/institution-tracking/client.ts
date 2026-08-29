'use client'

import type { z } from 'zod'
import {
  institutionTrackingDirectorySchema,
  type InstitutionTrackingDirectory,
} from './directory'
import {
  institutionStudentLearningAnalysisSchema,
  type InstitutionStudentLearningAnalysis,
} from './student-analysis'
import {
  institutionStudyProgramDraftResponseSchema,
  institutionStudyProgramMutationResultSchema,
  type InstitutionStudyProgramDraftResponse,
} from './study-program'
import {
  institutionClassroomOverviewSchema,
  type InstitutionClassroomOverview,
} from './classroom-overview'
import {
  institutionFollowupListSchema,
  institutionFollowupMutationSchema,
  type InstitutionFollowupList,
  type InstitutionFollowupMutation,
} from './followup'
import {
  institutionProgramReviewEvidenceSchema,
  institutionProgramReviewMutationSchema,
  institutionStudentProgramHistorySchema,
  type InstitutionProgramReviewMutation,
  type InstitutionStudentProgramHistory,
} from './program-review'
import {
  institutionStudentReportListSchema,
  institutionStudentReportMutationSchema,
  type InstitutionStudentReportList,
  type InstitutionStudentReportMutation,
} from './student-report'
import {
  institutionScopeListSchema,
  type InstitutionLearningScope,
  type InstitutionScopeList,
} from './scope'

export function isInstitutionTrackingUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED === 'true'
}

export class InstitutionTrackingClientError extends Error {
  constructor(readonly status: number) {
    super(`institution_tracking_request_${status}`)
    this.name = 'InstitutionTrackingClientError'
  }
}

async function requestJson<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal })
  if (!response.ok) throw new InstitutionTrackingClientError(response.status)
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new InstitutionTrackingClientError(500)
  return parsed.data
}

async function postJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new InstitutionTrackingClientError(response.status)
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new InstitutionTrackingClientError(500)
  return parsed.data
}

export function fetchInstitutionTrackingDirectory(
  signal?: AbortSignal,
): Promise<InstitutionTrackingDirectory> {
  return requestJson('/api/institution/tracking/directory', institutionTrackingDirectorySchema, signal)
}

export function fetchInstitutionLearningScopes(signal?: AbortSignal): Promise<InstitutionScopeList> {
  return requestJson('/api/institution/tracking/scopes', institutionScopeListSchema, signal)
}

type ScopeSelection = Pick<InstitutionLearningScope, 'game' | 'displayExamRef'>
const LEGACY_MATH_SCOPE: ScopeSelection = { game: 'matematik', displayExamRef: 'TYT' }

function isScopeSelection(value: ScopeSelection | AbortSignal | undefined): value is ScopeSelection {
  return Boolean(value && 'game' in value && 'displayExamRef' in value)
}

function scopeQuery(scope: ScopeSelection): string {
  return new URLSearchParams({ game: scope.game, exam_ref: scope.displayExamRef }).toString()
}

export function fetchInstitutionStudentLearningAnalysis(
  classroomId: string,
  memberRef: string,
  scopeOrSignal?: ScopeSelection | AbortSignal,
  suppliedSignal?: AbortSignal,
): Promise<InstitutionStudentLearningAnalysis> {
  const scope = isScopeSelection(scopeOrSignal) ? scopeOrSignal : LEGACY_MATH_SCOPE
  const signal = isScopeSelection(scopeOrSignal) ? suppliedSignal : scopeOrSignal
  return requestJson(
    `/api/institution/tracking/classrooms/${encodeURIComponent(classroomId)}/students/${encodeURIComponent(memberRef)}?${scopeQuery(scope)}`,
    institutionStudentLearningAnalysisSchema,
    signal,
  )
}

export function fetchInstitutionClassroomOverview(
  classroomId: string,
  scopeOrSignal?: ScopeSelection | AbortSignal,
  suppliedSignal?: AbortSignal,
): Promise<InstitutionClassroomOverview> {
  const scope = isScopeSelection(scopeOrSignal) ? scopeOrSignal : LEGACY_MATH_SCOPE
  const signal = isScopeSelection(scopeOrSignal) ? suppliedSignal : scopeOrSignal
  return requestJson(
    `/api/institution/tracking/classrooms/${encodeURIComponent(classroomId)}/overview?${scopeQuery(scope)}`,
    institutionClassroomOverviewSchema,
    signal,
  )
}

export function createInstitutionStudyProgramDraft(input: {
  classroomId: string; memberRef: string; weekStart: string; dailyMinuteLimit: number
}): Promise<InstitutionStudyProgramDraftResponse> {
  return postJson('/api/institution/tracking/programs/draft', {
    ...input, requestId: crypto.randomUUID(),
  }, institutionStudyProgramDraftResponseSchema)
}

export function publishInstitutionStudyProgram(programRef: string) {
  return postJson(
    `/api/institution/tracking/programs/${encodeURIComponent(programRef)}/publish`,
    { requestId: crypto.randomUUID() },
    institutionStudyProgramMutationResultSchema,
  )
}

export function updateInstitutionStudyProgramDraft(
  programRef: string,
  input: Pick<InstitutionStudyProgramDraftResponse['draft'], 'weekStart' | 'dailyMinuteLimit' | 'items'>,
) {
  return fetch(`/api/institution/tracking/programs/${encodeURIComponent(programRef)}`, {
    method: 'PATCH', cache: 'no-store', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, requestId: crypto.randomUUID() }),
  }).then(async (response) => {
    if (!response.ok) throw new InstitutionTrackingClientError(response.status)
    const parsed = institutionStudyProgramMutationResultSchema.safeParse(await response.json().catch(() => null))
    if (!parsed.success) throw new InstitutionTrackingClientError(500)
    return parsed.data
  })
}

export function fetchInstitutionStudentFollowups(
  classroomId: string,
  memberRef: string,
  signal?: AbortSignal,
): Promise<InstitutionFollowupList> {
  const query = new URLSearchParams({ classroomId, memberRef })
  return requestJson(`/api/institution/tracking/followups?${query}`, institutionFollowupListSchema, signal)
}

export function openInstitutionStudentFollowup(input: {
  classroomId: string
  memberRef: string
  reasonCode: 'support_needed' | 'inactivity' | 'learning_decline' | 'program_review'
  note: string | null
}): Promise<InstitutionFollowupMutation> {
  return postJson('/api/institution/tracking/followups', {
    ...input,
    requestId: crypto.randomUUID(),
  }, institutionFollowupMutationSchema)
}

export async function resolveInstitutionStudentFollowup(
  followupRef: string,
): Promise<InstitutionFollowupMutation> {
  const response = await fetch(`/api/institution/tracking/followups/${encodeURIComponent(followupRef)}`, {
    method: 'PATCH', cache: 'no-store', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: crypto.randomUUID() }),
  })
  if (!response.ok) throw new InstitutionTrackingClientError(response.status)
  const parsed = institutionFollowupMutationSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new InstitutionTrackingClientError(500)
  return parsed.data
}

export function fetchInstitutionStudentProgramHistory(
  classroomId: string,
  memberRef: string,
  signal?: AbortSignal,
): Promise<InstitutionStudentProgramHistory> {
  const query = new URLSearchParams({ classroomId, memberRef })
  return requestJson(`/api/institution/tracking/programs/history?${query}`, institutionStudentProgramHistorySchema, signal)
}

export function previewInstitutionStudyProgramReview(programRef: string) {
  return requestJson(
    `/api/institution/tracking/programs/${encodeURIComponent(programRef)}/review`,
    institutionProgramReviewEvidenceSchema,
  )
}

export function reviewInstitutionStudyProgram(
  programRef: string,
  input: { teacherResult: 'effective' | 'partial' | 'ineffective' | 'insufficient'; note: string | null },
): Promise<InstitutionProgramReviewMutation> {
  return postJson(
    `/api/institution/tracking/programs/${encodeURIComponent(programRef)}/review`,
    { ...input, requestId: crypto.randomUUID() },
    institutionProgramReviewMutationSchema,
  )
}

export function fetchInstitutionStudentReports(
  classroomId: string,
  memberRef: string,
  signal?: AbortSignal,
): Promise<InstitutionStudentReportList> {
  const query = new URLSearchParams({ classroomId, memberRef })
  return requestJson(`/api/institution/tracking/reports?${query}`, institutionStudentReportListSchema, signal)
}

export function createInstitutionStudentReport(
  classroomId: string,
  memberRef: string,
): Promise<InstitutionStudentReportMutation> {
  return postJson('/api/institution/tracking/reports', {
    classroomId, memberRef, requestId: crypto.randomUUID(),
  }, institutionStudentReportMutationSchema)
}
