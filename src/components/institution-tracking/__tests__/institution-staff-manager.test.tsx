import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstitutionStaffManager } from '../institution-staff-manager'

const MANAGER_REF = 'a'.repeat(32)
const TEACHER_REF = 'b'.repeat(32)
const MANAGER_ROLE_REF = 'c'.repeat(32)
const TEACHER_ROLE_REF = 'd'.repeat(32)
const roles = [
  { roleRef: MANAGER_ROLE_REF, name: 'Kurum Yöneticisi', description: 'Kurum yöneticisi rolü.', system: true, roleKey: 'manager' as const, permissions: [], memberCount: 1 },
  { roleRef: TEACHER_ROLE_REF, name: 'Öğretmen', description: 'Kurum öğretmeni rolü.', system: true, roleKey: 'teacher' as const, permissions: [], memberCount: 1 },
]
const members = [
  { memberRef: MANAGER_REF, alias: 'Yönetici Bir', membershipRole: 'manager' as const, roleRefs: [MANAGER_ROLE_REF] },
  { memberRef: TEACHER_REF, alias: 'Öğretmen Bir', membershipRole: 'teacher' as const, roleRefs: [TEACHER_ROLE_REF] },
]

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => json({})))
})

afterEach(() => vi.unstubAllGlobals())

describe('InstitutionStaffManager', () => {
  it('adds a registered teacher by normalized email without exposing user or tenant ids', async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InstitutionStaffManager members={members.slice(0, 1)} roles={roles} onChanged={onChanged} />)

    await user.type(screen.getByLabelText('Öğretmenin Bilge Arena e-posta adresi'), '  Ogretmen@Example.com ')
    await user.click(screen.getByRole('button', { name: 'Öğretmen ekle' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/institution/staff', expect.objectContaining({ method: 'POST' })))
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body).toEqual({ teacherEmail: 'ogretmen@example.com', requestId: expect.any(String) })
    expect(String(init?.body)).not.toContain('teacherUserId')
    expect(String(init?.body)).not.toContain('institutionId')
    expect(onChanged).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent('Öğretmen kuruma eklendi')
  })

  it('removes only teacher members by opaque reference after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InstitutionStaffManager members={members} roles={roles} onChanged={onChanged} />)

    expect(screen.queryByRole('button', { name: /Yönetici Bir.*kurumdan çıkar/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Öğretmen Bir.*kurumdan çıkar/i }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Öğretmen Bir'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      `/api/institution/staff/${TEACHER_REF}`,
      expect.objectContaining({ method: 'DELETE' }),
    ))
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({ requestId: expect.any(String) })
    expect(onChanged).toHaveBeenCalledOnce()
    confirm.mockRestore()
  })

  it('keeps destructive cancellation inert and surfaces server errors', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InstitutionStaffManager members={members} roles={roles} onChanged={onChanged} />)

    await user.click(screen.getByRole('button', { name: /Öğretmen Bir.*kurumdan çıkar/i }))
    expect(fetch).not.toHaveBeenCalled()

    vi.mocked(fetch).mockImplementationOnce(() => json({ error: 'Doğrulanmış hesap bulunamadı' }, 404))
    await user.type(screen.getByLabelText('Öğretmenin Bilge Arena e-posta adresi'), 'yok@example.com')
    await user.click(screen.getByRole('button', { name: 'Öğretmen ekle' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Doğrulanmış hesap bulunamadı')
    expect(onChanged).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('explicitly enables the manager teacher system role without a second membership', async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<InstitutionStaffManager members={members.slice(0, 1)} roles={roles} onChanged={onChanged} />)

    await user.click(screen.getByRole('button', { name: 'Öğretmenliği aç' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/institution/staff',
      expect.objectContaining({ method: 'PATCH' }),
    ))
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({ enabled: true, requestId: expect.any(String) })
    expect(onChanged).toHaveBeenCalledOnce()
    expect(await screen.findByRole('status')).toHaveTextContent('sınıflara öğretmen olarak atanabilir')
  })

  it('shows and disables the teacher role on a dual-role manager', async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const dualManager = [{ ...members[0], roleRefs: [MANAGER_ROLE_REF, TEACHER_ROLE_REF] }]
    render(<InstitutionStaffManager members={dualManager} roles={roles} onChanged={onChanged} />)

    expect(screen.getByText('Kurum yöneticisi · Öğretmen')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Öğretmenliği kapat' }))
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({ enabled: false, requestId: expect.any(String) })
  })
})
