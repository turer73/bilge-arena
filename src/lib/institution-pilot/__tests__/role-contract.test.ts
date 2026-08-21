import { describe, expect, it } from 'vitest'
import {
  institutionRoleDirectorySchema,
  institutionRoleWriteSchema,
} from '../role-contract'

const managerRoleRef = 'a'.repeat(32)
const customRoleRef = 'b'.repeat(32)
const memberRef = 'c'.repeat(32)

describe('institution role contract', () => {
  it('accepts a bounded tenant role directory without raw user identifiers', () => {
    const directory = {
      permissions: [{
        permission: 'institution.classrooms.view_all',
        label: 'Tüm sınıfları görüntüleme',
        description: 'Kurumdaki bütün aktif sınıfları görüntüler.',
        delegable: true,
      }],
      roles: [
        { roleRef: managerRoleRef, name: 'Kurum Yöneticisi', description: 'Sistem yöneticisi.', system: true, roleKey: 'manager', permissions: [], memberCount: 1 },
        { roleRef: customRoleRef, name: 'Koordinatör', description: 'Kurum sınıflarını izler.', system: false, roleKey: null, permissions: ['institution.classrooms.view_all'], memberCount: 1 },
      ],
      members: [{ memberRef, alias: 'Öğretmen Bir', membershipRole: 'teacher', roleRefs: [customRoleRef] }],
    }
    expect(institutionRoleDirectorySchema.parse(directory)).toEqual(directory)
    expect(institutionRoleDirectorySchema.safeParse({ ...directory, userId: crypto.randomUUID() }).success).toBe(false)
  })

  it('rejects duplicate, unknown and manager-only permissions from client writes', () => {
    const base = {
      name: 'Koordinatör', description: null,
      permissions: ['institution.classrooms.view_all'],
      requestId: '11111111-1111-4111-8111-111111111111',
    }
    expect(institutionRoleWriteSchema.safeParse(base).success).toBe(true)
    expect(institutionRoleWriteSchema.safeParse({ ...base, permissions: [...base.permissions, ...base.permissions] }).success).toBe(false)
    expect(institutionRoleWriteSchema.safeParse({ ...base, permissions: ['institution.roles.manage'] }).success).toBe(false)
    expect(institutionRoleWriteSchema.safeParse({ ...base, permissions: ['institution.unknown'] }).success).toBe(false)
  })

  it('rejects duplicate role refs and assignments to unknown roles', () => {
    const role = { roleRef: managerRoleRef, name: 'Kurum Yöneticisi', description: 'Sistem yöneticisi.', system: true, roleKey: 'manager', permissions: [], memberCount: 1 }
    const base = {
      permissions: [],
      roles: [role],
      members: [{ memberRef, alias: 'Öğretmen Bir', membershipRole: 'teacher', roleRefs: [managerRoleRef] }],
    }
    expect(institutionRoleDirectorySchema.safeParse({ ...base, roles: [role, role] }).success).toBe(false)
    expect(institutionRoleDirectorySchema.safeParse({
      ...base,
      members: [{ ...base.members[0], roleRefs: [customRoleRef] }],
    }).success).toBe(false)
  })
})
