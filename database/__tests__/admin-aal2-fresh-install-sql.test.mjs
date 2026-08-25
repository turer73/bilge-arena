import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/161_admin_write_requires_aal2.sql', import.meta.url),
  'utf8',
)

describe('migration 161 fresh-install verification contract', () => {
  it('does not require production user data to apply on an empty environment', () => {
    expect(sql).toContain('IF v_admin IS NULL THEN')
    expect(sql).toContain('veri-bagimli claim simulasyonu atlandi')
    expect(sql).not.toContain("RAISE EXCEPTION '161 dogrulama: admin.questions.edit izni olan kullanici bulunamadi'")
  })

  it('still verifies AAL1 denial, AAL2 allowance, and policy structure when an admin exists', () => {
    expect(sql).toContain("'aal', 'aal1'")
    expect(sql).toContain("'aal', 'aal2'")
    expect(sql).toContain("ILIKE '%has_admin_write_access%'")
    expect(sql).toContain('IF v_policy_count <> 20 THEN')
  })
})
