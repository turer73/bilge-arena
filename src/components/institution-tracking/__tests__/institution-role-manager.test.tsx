import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ usePathname: () => '/arena/kurum/roller' }))
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
    { permission: 'institution.classrooms.manage', label: 'Sınıf yönetimi', description: 'Kurum yöneticisinin aktif öğretmene sınıf atamasını sağlar.', delegable: false },
    { permission: 'institution.staff.manage', label: 'Personel yönetimi', description: 'Kurum personelini ekler veya kurumdan çıkarır.', delegable: false },
    { permission: 'institution.roles.manage', label: 'Rol ve yetki yönetimi', description: 'Kurum rollerini oluşturur ve personele atar.', delegable: false },
    { permission: 'institution.support.manage', label: 'Destek erişimi yönetimi', description: 'Süreli destek erişimini kurum içinde yönetir.', delegable: false },
  ],
  roles: [
    { roleRef: MANAGER_ROLE, name: 'Kurum Yöneticisi', description: 'Değiştirilemeyen sistem rolü.', system: true, roleKey: 'manager', permissions: ['institution.workspace.view', 'institution.classrooms.view_all', 'institution.classrooms.manage', 'institution.staff.manage', 'institution.roles.manage', 'institution.support.manage'], memberCount: 1 },
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
    expect(await screen.findByRole('heading', { name: 'Roller ve Destek' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bilge Arena destek erişimi' })).toBeInTheDocument()
    expect(await screen.findByText('Kurum Yöneticisi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kurum Yöneticisi rolünü sil/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü düzenle/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü sil/i })).toBeInTheDocument()
    expect(screen.getByText('Sınıf yönetimi')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Sınıf yönetimi/i })).not.toBeInTheDocument()
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

  it('creates and edits a custom role through strict tenant endpoints', async () => {
    const fetchMock = vi.mocked(fetch)
    const user = userEvent.setup()
    render(<InstitutionRoleManager />)
    await screen.findByText('Kurum Yöneticisi')

    await user.click(screen.getByRole('button', { name: 'Rol oluştur' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/institution/roles', expect.objectContaining({ method: 'POST' })))
    const createCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST' && !String(init?.body).includes('memberRef'))
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      name: 'Rehberlik Koordinatörü',
      permissions: ['institution.classrooms.view_all'],
    })

    await user.click(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü düzenle/i }))
    const nameInput = screen.getByLabelText('Rol adı')
    await user.clear(nameInput)
    await user.type(nameInput, 'Akademik Koordinatör')
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/institution/roles/${CUSTOM_ROLE}`,
      expect.objectContaining({ method: 'PATCH' }),
    ))
  })

  it('deletes a custom role only after confirmation and reports load failures', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetchMock = vi.mocked(fetch)
    const user = userEvent.setup()
    render(<InstitutionRoleManager />)
    await screen.findByText('Kurum Yöneticisi')
    await user.click(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü sil/i }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Rehberlik Koordinatörü'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/institution/roles/${CUSTOM_ROLE}`,
      expect.objectContaining({ method: 'DELETE' }),
    ))

    fetchMock.mockImplementationOnce(() => json({ error: 'Kurum yöneticisi yetkisi gerekli' }, 403))
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kurum yöneticisi yetkisi gerekli')
    confirm.mockRestore()
  })

  it('cancels edits, toggles permissions and keeps destructive cancellation inert', async () => {
    const fetchMock = vi.mocked(fetch)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    render(<InstitutionRoleManager />)
    await screen.findByText('Kurum Yöneticisi')
    await user.click(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü düzenle/i }))
    const permission = screen.getByRole('checkbox', { name: /Tüm sınıfları görüntüleme/i })
    expect(permission).toBeChecked()
    await user.click(permission)
    expect(permission).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(screen.getByRole('button', { name: 'Rol oluştur' })).toBeInTheDocument()

    const before = fetchMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: /Rehberlik Koordinatörü rolünü sil/i }))
    expect(fetchMock.mock.calls).toHaveLength(before)
    confirm.mockRestore()
  })

  it('revokes assigned roles and surfaces mutation errors', async () => {
    const assigned = {
      ...directory,
      roles: directory.roles.map((role) => role.roleRef === CUSTOM_ROLE ? { ...role, memberCount: 1 } : role),
      members: directory.members.map((member) => member.memberRef === TEACHER_MEMBER
        ? { ...member, roleRefs: [...member.roleRefs, CUSTOM_ROLE] }
        : member),
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(() => json(assigned))
    const user = userEvent.setup()
    render(<InstitutionRoleManager />)
    const teachers = await screen.findAllByText('Öğretmen Bir')
    const row = teachers.map((teacher) => teacher.closest('label')).find(Boolean)
    fetchMock.mockImplementationOnce(() => json({ error: 'Rol ataması güncellenemedi' }, 409))
    await user.click(row!.querySelector('input')!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/institution/roles/${CUSTOM_ROLE}/members/${TEACHER_MEMBER}`,
      expect.objectContaining({ method: 'DELETE' }),
    ))
    expect(await screen.findByRole('alert')).toHaveTextContent('Rol ataması güncellenemedi')
  })
})
