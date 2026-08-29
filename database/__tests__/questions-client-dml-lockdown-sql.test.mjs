import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/163_questions_client_dml_lockdown.sql', import.meta.url),
  'utf8',
)

describe('migration 163 questions client DML lockdown contract', () => {
  it('removes every direct client mutation privilege and stale write policy', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.questions\s+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toContain('DROP POLICY IF EXISTS "questions_update_admin_rbac"')
    expect(sql).toContain('DROP POLICY IF EXISTS "questions_delete_admin_rbac"')
    expect(sql).toContain("has_table_privilege('authenticated', 'public.questions', 'UPDATE')")
    expect(sql).toContain("has_any_column_privilege('authenticated', 'public.questions', 'UPDATE')")
    expect(sql).toContain("cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')")
    expect(sql).toContain('v_unexpected_grantees')
    expect(sql).toContain("grant_row.privilege_type IN ('INSERT','UPDATE','DELETE')")
    expect(sql).toContain("to_regprocedure('public.create_governed_question(uuid,jsonb,uuid)')")
    expect(sql).toContain("to_regprocedure('public.publish_question_content_revision(uuid,uuid,uuid)')")
    expect(sql).toContain("to_regprocedure('public.quarantine_question_content(uuid,uuid,text,uuid)')")
    expect(sql).toContain('NOT p.prosecdef')
    expect(sql).toContain("owner_role.rolname NOT IN ('postgres','supabase_admin')")
    expect(sql).toContain("'search_path=pg_catalog'=ANY")
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_governed_question[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_governed_question[\s\S]*TO service_role/)
    expect(sql).toContain("has_function_privilege('authenticated','public.create_governed_question(uuid,jsonb,uuid)','EXECUTE')")
    expect(sql).toContain("has_function_privilege('service_role','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE')")
  })

  it('forces service callers through definer governance RPCs and keeps the answer projection intact', () => {
    expect(sql).not.toMatch(/GRANT INSERT, UPDATE, DELETE ON TABLE public\.questions\s+TO service_role/)
    expect(sql).toContain("has_table_privilege('service_role', 'public.questions', 'UPDATE')")
    expect(sql).toContain("has_any_column_privilege('service_role', 'public.questions', 'UPDATE')")
    expect(sql).toContain("has_column_privilege('authenticated', 'public.questions', 'id', 'SELECT')")
    expect(sql).toContain("has_column_privilege('authenticated', 'public.questions', 'content', 'SELECT')")
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
})
