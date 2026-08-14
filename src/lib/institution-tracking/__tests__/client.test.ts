import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchInstitutionStudentLearningAnalysis,
  fetchInstitutionTrackingDirectory,
  fetchInstitutionClassroomOverview,
  InstitutionTrackingClientError,
  createInstitutionStudyProgramDraft,
  publishInstitutionStudyProgram,
} from '../client'

const directory = {
  institution: { name: 'Bilge Pilot Kursu', status: 'pilot' },
  membership: { role: 'manager' },
  classrooms: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('institution tracking client', () => {
  it('requests the no-store directory and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(directory), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchInstitutionTrackingDirectory()).resolves.toEqual(directory)
    expect(fetchMock).toHaveBeenCalledWith('/api/institution/tracking/directory', {
      cache: 'no-store',
      signal: undefined,
    })
  })

  it('encodes opaque path segments and rejects out-of-contract data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ leak: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchInstitutionStudentLearningAnalysis('class/id', 'member ref')).rejects.toMatchObject({ status: 500 })
    expect(fetchMock.mock.calls[0][0]).toContain('class%2Fid/students/member%20ref')
  })

  it('requests a no-store classroom aggregate without leaking ids in query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ invalid: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchInstitutionClassroomOverview('class/id')).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledWith('/api/institution/tracking/classrooms/class%2Fid/overview', {
      cache: 'no-store', signal: undefined,
    })
  })

  it('preserves only the HTTP status in client errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('database secret', { status: 403 })))
    const error = await fetchInstitutionTrackingDirectory().catch((caught) => caught)
    expect(error).toBeInstanceOf(InstitutionTrackingClientError)
    expect(error).toMatchObject({ status: 403, message: 'institution_tracking_request_403' })
    expect(String(error)).not.toContain('database secret')
  })

  it('uses distinct idempotency ids for draft and publish writes', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    vi.stubGlobal('crypto', { randomUUID })
    const draftResponse = {
      program: { programRef: 'a'.repeat(32), status: 'draft', weekStart: '2026-08-17', dailyMinuteLimit: 45, modelVersion: 'institution-program-v1', itemCount: 1, createdAt: '2026-08-14T00:00:00.000Z', reviewedAt: null, publishedAt: null, replayed: false },
      draft: { status: 'draft', weekStart: '2026-08-17', modelVersion: 'institution-program-v1', generatedAt: '2026-08-14T00:00:00.000Z', dailyMinuteLimit: 45, items: [{ position: 1, scheduledDate: '2026-08-17', taskType: 'diagnostic', title: 'Temel kavramlar durum tespiti', reasonCode: 'diagnostic_gap', outcomeCode: 'MAT-01', durationMinutes: 20, targetQuestionCount: 10 }] },
    }
    const published = { ...draftResponse.program, status: 'published', reviewedAt: '2026-08-14T00:05:00.000Z', publishedAt: '2026-08-14T00:05:00.000Z' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(draftResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(published), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await createInstitutionStudyProgramDraft({ classroomId: 'c', memberRef: 'm', weekStart: '2026-08-17', dailyMinuteLimit: 45 })
    await publishInstitutionStudyProgram('a'.repeat(32))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ requestId: '11111111-1111-4111-8111-111111111111' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ requestId: '22222222-2222-4222-8222-222222222222' })
  })
})
