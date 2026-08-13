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

export function fetchInstitutionStudentLearningAnalysis(
  classroomId: string,
  memberRef: string,
  signal?: AbortSignal,
): Promise<InstitutionStudentLearningAnalysis> {
  return requestJson(
    `/api/institution/tracking/classrooms/${encodeURIComponent(classroomId)}/students/${encodeURIComponent(memberRef)}?game=matematik&exam_ref=TYT`,
    institutionStudentLearningAnalysisSchema,
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
