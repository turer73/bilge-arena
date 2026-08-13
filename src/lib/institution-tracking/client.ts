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
