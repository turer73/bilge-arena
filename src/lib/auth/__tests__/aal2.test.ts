import { describe, expect, it } from 'vitest'
import { permissionRequiresAal2, safeMfaReturnPath } from '../aal2'

describe('AAL2 policy', () => {
  it.each(['admin.users.view', 'institution.pilot.access', 'teacher.classrooms.manage'])(
    '%s iznini AAL2 ile korur',
    (permission) => expect(permissionRequiresAal2(permission)).toBe(true),
  )

  it('ogrenci izinlerini AAL2 zorunluluguna almaz', () => {
    expect(permissionRequiresAal2('questions.answer')).toBe(false)
  })

  it('yalniz same-origin relatif donus yollarini kabul eder', () => {
    expect(safeMfaReturnPath('/admin?tab=users')).toBe('/admin?tab=users')
    expect(safeMfaReturnPath('https://evil.example')).toBe('/arena')
    expect(safeMfaReturnPath('//evil.example')).toBe('/arena')
  })
})
