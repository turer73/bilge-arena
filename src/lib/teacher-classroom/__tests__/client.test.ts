import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchStudentTeacherMemberships,
} from '../client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('teacher classroom browser client', () => {
  it('uses no-store for private classroom responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ classrooms: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchStudentTeacherMemberships()).resolves.toEqual({ classrooms: [] })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/teacher/memberships',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('rejects a response that leaks an unknown student field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        classrooms: [{
          id: '11111111-2222-4333-8444-555555555555',
          name: '12-A Matematik',
          teacherAlias: 'Öğretmen 4',
          joinedAt: '2026-08-09T10:00:00.000Z',
          studentEmail: 'private@example.com',
        }],
      }),
    }))

    await expect(fetchStudentTeacherMemberships()).rejects.toMatchObject({
      status: 500,
    })
  })
})
