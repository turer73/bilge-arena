import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '126_institution_tenant_rbac.sql'),
  'utf8',
)

describe('126 institution tenant RBAC SQL contract', () => {
  it('keeps institution roles tenant-scoped and direct table access closed', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.institution_roles')
    expect(sql).toContain('FOREIGN KEY (membership_id, institution_id)')
    expect(sql).toContain('FOREIGN KEY (role_id, institution_id)')
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]+institution_membership_roles[\s\S]+service_role/)
    expect(sql).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE) ON (TABLE )?public\.institution_(roles|role_permissions|membership_roles)/)
  })

  it('keeps system authority immutable and custom permissions delegable-only', () => {
    expect(sql).toContain("role_key IN ('manager', 'teacher')")
    expect(sql).toContain('AND NOT is_system')
    expect(sql).toContain('catalog.delegable')
    expect(sql).toContain("'institution.classrooms.view_all'")
    expect(sql).toContain("'institution.roles.manage'")
  })

  it('uses opaque references, idempotent writes and service-only RPCs', () => {
    expect(sql).toContain("role_ref ~ '^[0-9a-f]{32}$'")
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("operation = 'create_institution_role'")
    expect(sql).toContain('set_my_institution_role_assignment')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})
