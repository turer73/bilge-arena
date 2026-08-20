import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstitutionClassroomCreatePanel } from '../institution-classroom-create-panel'

const TEACHER_REF = 'a'.repeat(32)
const TEACHER_ROLE_REF = 'c'.repeat(32)
const directory = {
  permissions: [],
  roles: [{
    roleRef: TEACHER_ROLE_REF,
    name: 'Öğretmen',
    description: 'Kurum öğretmeni sistem rolü.',
    system: true,
    roleKey: 'teacher',
    permissions: [],
    memberCount: 1,
  }],
  members: [
    { memberRef: 'b'.repeat(32), alias: 'Yönetici Bir', membershipRole: 'manager', roleRefs: [] },
    { memberRef: TEACHER_REF, alias: 'Öğretmen Bir', membershipRole: 'teacher', roleRefs: [] },
  ],
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => json(directory)))
})

afterEach(() => vi.unstubAllGlobals())

describe('InstitutionClassroomCreatePanel', () => {
  it('creates a teacher-owned classroom without sending tenant or user identifiers', async () => {
    const fetchMock = vi.mocked(fetch)
    const onCreated = vi.fn()
    const user = userEvent.setup()
    render(<InstitutionClassroomCreatePanel onCancel={vi.fn()} onCreated={onCreated} />)

    expect(await screen.findByRole('option', { name: 'Öğretmen Bir' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Sınıf adı'), 'TYT Matematik A')
    fetchMock.mockImplementationOnce(() => json({
      classroom: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'TYT Matematik A',
        status: 'active',
        createdAt: '2026-08-20T12:00:00.000Z',
      },
      teacher: { memberRef: TEACHER_REF, alias: 'Öğretmen Bir' },
      replayed: false,
    }, 201))
    await user.click(screen.getByRole('button', { name: 'Sınıfı oluştur' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(createCall?.[0]).toBe('/api/institution/classrooms')
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      teacherMemberRef: TEACHER_REF,
      name: 'TYT Matematik A',
      requestId: expect.any(String),
    })
    expect(String(createCall?.[1]?.body)).not.toContain('institutionId')
    expect(String(createCall?.[1]?.body)).not.toContain('userId')
  })

  it('explains that a teacher role is required when the manager is not a teacher', async () => {
    vi.mocked(fetch).mockImplementationOnce(() => json({
      ...directory,
      members: directory.members.filter((member) => member.membershipRole !== 'teacher'),
    }))
    render(<InstitutionClassroomCreatePanel onCancel={vi.fn()} onCreated={vi.fn()} />)

    expect(await screen.findByText('Aktif kurum öğretmeni bulunamadı')).toBeInTheDocument()
    expect(screen.getByText(/yöneticisi için öğretmenlik rolünü açın/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Öğretmen ve rol yönetimine git' })).toHaveAttribute('href', '/arena/kurum/roller')
    expect(screen.queryByRole('button', { name: 'Sınıfı oluştur' })).not.toBeInTheDocument()
  })

  it('offers a manager who also holds the teacher system role', async () => {
    vi.mocked(fetch).mockImplementationOnce(() => json({
      ...directory,
      roles: [{ ...directory.roles[0], memberCount: 1 }],
      members: [{
        memberRef: 'b'.repeat(32),
        alias: 'Yönetici Öğretmen',
        membershipRole: 'manager',
        roleRefs: [TEACHER_ROLE_REF],
      }],
    }))
    render(<InstitutionClassroomCreatePanel onCancel={vi.fn()} onCreated={vi.fn()} />)

    expect(await screen.findByRole('option', { name: 'Yönetici Öğretmen' })).toBeInTheDocument()
    expect(screen.queryByText('Aktif kurum öğretmeni bulunamadı')).not.toBeInTheDocument()
  })
})
