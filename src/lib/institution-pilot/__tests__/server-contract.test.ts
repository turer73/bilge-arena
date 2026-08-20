import { describe, expect, it } from 'vitest'
import {
  institutionPilotNoStoreJson,
  institutionPilotManagerTeacherInputSchema,
  institutionPilotManagerTeacherResultSchema,
  institutionPilotRpcStatus,
  institutionPilotTeacherAddInputSchema,
  institutionPilotTeacherAddResultSchema,
  institutionPilotTeacherRemoveResultSchema,
  institutionPilotWorkspaceSchema,
} from '../server-contract'

const workspace = {
  institution: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Bilge Pilot Kursu',
    status: 'pilot',
    studentLimit: 200,
    staffLimit: 6,
    staffCount: 2,
    createdAt: '2026-08-13T10:00:00.000Z',
  },
  membership: {
    memberRef: 'a'.repeat(32),
    role: 'manager',
    joinedAt: '2026-08-13T10:00:00.000Z',
  },
}

describe('institution pilot server contract', () => {
  it('accepts only the bounded tenant workspace response', () => {
    expect(institutionPilotWorkspaceSchema.parse(workspace)).toEqual(workspace)
    expect(institutionPilotWorkspaceSchema.safeParse({ ...workspace, email: 'leak@example.com' }).success)
      .toBe(false)
    expect(institutionPilotWorkspaceSchema.safeParse({
      ...workspace,
      institution: { ...workspace.institution, staffCount: 7 },
    }).success).toBe(false)
  })

  it('maps tenant authorization and conflict errors without leaking details', () => {
    expect(institutionPilotRpcStatus('42501')).toBe(403)
    expect(institutionPilotRpcStatus('P0002')).toBe(404)
    expect(institutionPilotRpcStatus('P0003')).toBe(409)
    expect(institutionPilotRpcStatus('unexpected')).toBe(500)
  })

  it('accepts a normalized teacher email at the server boundary but never a client user id', () => {
    const requestId = '33333333-3333-4333-8333-333333333333'
    expect(institutionPilotTeacherAddInputSchema.parse({
      teacherEmail: ' Teacher@Example.com ',
      requestId,
    })).toEqual({ teacherEmail: 'teacher@example.com', requestId })
    expect(institutionPilotTeacherAddInputSchema.safeParse({
      teacherEmail: 'teacher@example.com',
      requestId,
      teacherUserId: '44444444-4444-4444-8444-444444444444',
    }).success).toBe(false)
    expect(institutionPilotTeacherAddResultSchema.safeParse({
      institutionId: workspace.institution.id,
      memberRef: 'b'.repeat(32),
      role: 'teacher',
      joinedAt: workspace.membership.joinedAt,
      replayed: false,
    }).success).toBe(true)
    expect(institutionPilotTeacherRemoveResultSchema.safeParse({
      institutionId: workspace.institution.id,
      memberRef: 'b'.repeat(32),
      status: 'removed',
      endedAt: workspace.membership.joinedAt,
      replayed: false,
    }).success).toBe(true)
  })

  it('accepts only a boolean manager teacher toggle and opaque result', () => {
    const requestId = '33333333-3333-4333-8333-333333333333'
    expect(institutionPilotManagerTeacherInputSchema.parse({ enabled: true, requestId }))
      .toEqual({ enabled: true, requestId })
    expect(institutionPilotManagerTeacherInputSchema.safeParse({
      enabled: true,
      requestId,
      memberRef: 'b'.repeat(32),
    }).success).toBe(false)
    expect(institutionPilotManagerTeacherResultSchema.safeParse({
      memberRef: 'b'.repeat(32),
      enabled: true,
      replayed: false,
    }).success).toBe(true)
  })

  it('sets private fail-closed response headers', () => {
    const response = institutionPilotNoStoreJson({ ok: true })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})
