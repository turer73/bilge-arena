import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchInstitutionStudentLearningAnalysis,
  fetchInstitutionTrackingDirectory,
  InstitutionTrackingClientError,
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

  it('preserves only the HTTP status in client errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('database secret', { status: 403 })))
    const error = await fetchInstitutionTrackingDirectory().catch((caught) => caught)
    expect(error).toBeInstanceOf(InstitutionTrackingClientError)
    expect(error).toMatchObject({ status: 403, message: 'institution_tracking_request_403' })
    expect(String(error)).not.toContain('database secret')
  })
})
