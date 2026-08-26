import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/171_admin_route_only_dml_lockdown.sql', import.meta.url),
  'utf8',
)

describe('migration 171 admin route-only DML lockdown contract', () => {
  it('revokes browser and service direct writes from route-only tables', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/)
    for (const table of ['roles', 'role_permissions', 'user_roles', 'homepage_sections', 'homepage_elements', 'site_settings', 'admin_logs', 'error_reports']) {
      expect(sql).toContain(`public.${table}`)
    }
    expect(sql).toContain('REVOKE INSERT (%I), UPDATE (%I) ON TABLE public.%I')
    expect(sql).not.toMatch(/GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]*public\.(roles|role_permissions|user_roles|homepage_sections|homepage_elements)/i)
  })

  it('preserves only the documented server/legacy exceptions', () => {
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.site_settings TO service_role;')
    expect(sql).toContain('GRANT SELECT, UPDATE ON TABLE public.error_reports TO service_role;')
    expect(sql).toContain('GRANT INSERT (user_id, question_id, report_type, description)')
    expect(sql).toContain("has_column_privilege('authenticated', 'public.error_reports', 'status', 'INSERT')")
    expect(sql).toContain("has_column_privilege('authenticated', 'public.error_reports', 'admin_note', 'INSERT')")
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.admin_logs TO service_role;')
    expect(sql).toContain("has_table_privilege('authenticated', 'public.error_reports', 'UPDATE')")
    expect(sql).toContain("has_table_privilege('authenticated', 'public.error_reports', 'DELETE')")
  })

  it('drops forged audit/write policies and makes admin_logs append-only', () => {
    for (const policy of [
      'roles_manage_insert', 'role_permissions_manage_insert', 'user_roles_manage_insert',
      'homepage_sections_admin_manage', 'homepage_elements_admin_manage',
      'site_settings_update_rbac', 'error_reports_update_admin_rbac',
      'admin_logs_insert_rbac',
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}"`)
    }
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.prevent_admin_log_mutation()')
    expect(sql).toContain("RAISE EXCEPTION 'admin_logs is append-only'")
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_admin_logs_append_only')
    expect(sql).toContain('CREATE TRIGGER trg_admin_logs_append_only')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.admin_logs')
  })

  it('self-verifies ACLs, policy shape, trigger presence, and helper consumers', () => {
    expect(sql).toContain('has_any_column_privilege')
    expect(sql).toContain("cmd <> 'SELECT'")
    expect(sql).toContain('pg_trigger')
    expect(sql).toContain("to_regprocedure('public.has_admin_write_access(text)')")
    expect(sql).toContain('pg_depend')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.has_admin_write_access(text)')
    expect(sql).toContain('v_unexpected')
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
})
