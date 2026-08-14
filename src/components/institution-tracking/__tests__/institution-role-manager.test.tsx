import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstitutionRoleManager } from '../institution-role-manager'

const MANAGER_ROLE = 'a'.repeat(32)
const TEACHER_ROLE = 'b'.repeat(32)
const CUSTOM_ROLE = 'c'.repeat(32)
const MANAGER_MEMBER = 'd'.repeat(32)
const TEACHER_MEMBER = 'e'.repeat(32)

const directory = {
  permissions: [
    { permission: 'institution.workspace.view', label: 'Kurum alanını görüntüleme', description: 'Kişinin kendi kurum alanını görüntülemesini sağlar.', delegable: false },
    { permission: 'institution.classrooms.view_all', label: 'Tüm sınıfları görüntüleme', description: 'Kurumdaki bütün aktif sınıfları ve öğrenci dizinini görüntüler.', delegable: true },
    { permission: 'institution.staff.manage', label: 'Personel yönetimi', description: 'Kurum personelini ekler veya kurumdan çıkarır.', delegable: false },
    { permission: 'institution.roles.manage', label: 'Rol ve yetki yönetimi', description: 'Kurum rollerini oluşturur ve personele atar.', delegable: false },
    { permission: 'institution.support.manage', label: 'Destek erişimi yönetimi', description: 'Süreli destek erişimini kurum içinde yönetir.', delegable: false },
  ],
  roles: [
    { roleRef: MANAGER_ROLE, name: 'Kurum Yöneticisi', description: 'Değiştirilemeyen sistem rolü.', system: true, roleKey: 'manager', permissions: ['institution.workspace.view', 'institution.classrooms.view_all', 'institution.staff.manage', 'institution.roles.manage', 'institution.support.manage'], memberCount: 1 },
    { roleRef: TEACHER_ROLE, name: 'Öğretmen', description: 'Temel öğretmen sistem rolü.', system: true, roleKey: 'teacher', permissions: ['institution.workspace.view'], memberCount: 1 },
    { roleRef: CUSTOM_ROLE, name: 'Rehberlik Koordinatörü', description: 'Tüm sınıfları takip eder.', system: false, roleKey: null, permissions: ['institution.classrooms.view_all'], memberCount: 0 },
  ],
  members: [
    { memberRef: MANAGER_MEMBER, alias: 'Yönetici Bir', membershipRole: 'manager', roleRefs: [MANAGER_ROLE] },
    { memberRef: TEACHER_MEMBER, alias: 'Öğretmen Bir', membershipRole: 'teacher', roleRefs: [TEACHER_ROLE] },
  ],
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => json(directory)))
})

afterEach(() => vi.unstubAllGlobals())

describe('InstitutionRoleManager', () => {
  it('shows immutable system roles and editable tenant roles', async () => {
    render(<InstitutionRoleManager />)
    expect(await screen.findByRole('heading', { name: 'Kurum Rolleri' })).toBeInTheDocument()
    expect(await screen.findByText('Kurum Yöneticisi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kurum Yöneticisi rolünü sil/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü düzenle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü sil/i })).toBeInTheDocument()
  })

  it('assigns a custom role using only opaque role and member references', async () => {
    const fetchMock = vi.mocked(fetch)
    render(<InstitutionRoleManager />)
    const user = userEvent.setup()
    const teachers = await screen.findAllByText('Öğretmen Bir')
    const row = teachers.map((teacher) => teacher.closest('label')).find(Boolean)
    expect(row).not.toBeNull()
    await user.click(row!.querySelector('input')!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/institution/roles/${CUSTOM_ROLE}/members/${TEACHER_MEMBER}`,
      expect.objectContaining({ method: 'POST' }),
    ))
    const [, init] = fetchMock.mock.calls.find(([path]) => String(path).includes('/members/'))!
    expect(JSON.parse(String(init?.body))).toEqual({ requestId: expect.any(String) })
    expect(String(init?.body)).not.toContain('userId')
    expect(String(init?.body)).not.toContain('institutionId')
  })
})
