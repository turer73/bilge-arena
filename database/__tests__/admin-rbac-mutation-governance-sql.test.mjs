import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/170_admin_rbac_mutation_governance.sql', import.meta.url),
  'utf8',
)

describe('migration 170 admin RBAC mutation governance', () => {
  it('makes all five mutations service-role-only RPCs', () => {
    for (const signature of [
      'admin_create_role(uuid,uuid,jsonb)',
      'admin_update_role(uuid,uuid,uuid,jsonb)',
      'admin_delete_role(uuid,uuid,uuid)',
      'admin_assign_role(uuid,uuid,uuid,uuid)',
      'admin_revoke_role(uuid,uuid,uuid,uuid)',
    ]) {
      expect(sql).toContain(`public.${signature}`)
    }
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role;/)
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE[\s\S]*public\.roles[\s\S]*public\.role_permissions[\s\S]*public\.user_roles/)
  })

  it('binds replay records and audit logs into the same transaction', () => {
    expect(sql).toContain('public.admin_rbac_mutation_requests')
    expect(sql.match(/INSERT INTO public\.admin_rbac_mutation_requests/g)).toHaveLength(5)
    expect(sql.match(/INSERT INTO public\.admin_logs/g)).toHaveLength(5)
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })

  it('guards permission replacement and recovery paths', () => {
    expect(sql).toMatch(/DELETE FROM public\.role_permissions[\s\S]*INSERT INTO public\.role_permissions/)
    expect(sql).toContain('at least one role manager must remain')
    expect(sql).toContain('own super admin role cannot be revoked')
    expect(sql.match(/admin-rbac-manager-recovery/g)).toHaveLength(2)
    expect(sql).toContain("COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'")
  })
})
