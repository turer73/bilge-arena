import { describe, expect, it } from 'vitest'
import {
  isInstitutionSurfacePath,
  isStaffEntryPath,
  resolveInstitutionLoginNext,
  safeAuthNext,
} from '../safe-next'

describe('isInstitutionSurfacePath', () => {
  it.each(['/arena/kurum', '/arena/kurum/', '/arena/kurum/roller', '/arena/kurum?tab=a'])(
    'matches the institution surface %s',
    (value) => expect(isInstitutionSurfacePath(value)).toBe(true),
  )

  it.each(['/arena/kurumsal', '/arena', '/hesap/kurum-erisim', '', null, undefined])(
    'rejects %s',
    (value) => expect(isInstitutionSurfacePath(value)).toBe(false),
  )
})

describe('resolveInstitutionLoginNext', () => {
  it('defaults to the institution workspace', () => {
    expect(resolveInstitutionLoginNext(null)).toBe('/arena/kurum')
    expect(resolveInstitutionLoginNext(undefined)).toBe('/arena/kurum')
  })

  it('keeps staff targets, including the nested MFA return path', () => {
    expect(resolveInstitutionLoginNext('/arena/kurum/roller')).toBe('/arena/kurum/roller')
    expect(resolveInstitutionLoginNext('/admin/kurumlar')).toBe('/admin/kurumlar')
    expect(resolveInstitutionLoginNext('/hesap/guvenlik?next=%2Fadmin%2Fkurumlar'))
      .toBe('/hesap/guvenlik?next=%2Fadmin%2Fkurumlar')
    expect(resolveInstitutionLoginNext('/arena/sinif/ogretmen/abc')).toBe('/arena/sinif/ogretmen/abc')
  })

  it.each(['/arena/matematik', '/arena', '/arena/kurumsal', '/profil'])(
    'overrides a student-surface next %s with the institution workspace',
    (value) => expect(resolveInstitutionLoginNext(value)).toBe('/arena/kurum'),
  )

  it.each(['https://evil.example', '//evil.example', '/\\evil.example'])(
    'never forwards an unsafe destination %s',
    (value) => expect(resolveInstitutionLoginNext(value)).toBe('/arena/kurum'),
  )

  it('treats /administrator as a student surface (segment boundary)', () => {
    expect(isStaffEntryPath('/administrator')).toBe(false)
    expect(isStaffEntryPath('/admin')).toBe(true)
  })
})

describe('safeAuthNext', () => {
  it('keeps safe relative application paths', () => {
    expect(safeAuthNext('/arena/kurum/roller')).toBe('/arena/kurum/roller')
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', null])(
    'rejects unsafe destination %s',
    (value) => {
      expect(safeAuthNext(value)).toBe('/arena')
    },
  )
})
