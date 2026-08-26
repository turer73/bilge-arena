import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/169_admin_homepage_mutation_governance.sql', import.meta.url),
  'utf8',
)

describe('migration 169 admin homepage mutation governance', () => {
  it('uses PostgreSQL-supported JSONB key counting', () => {
    expect(sql).not.toContain('jsonb_object_length')
    expect(sql).toContain('SELECT count(*) FROM jsonb_object_keys(p_payload)')
  })

  it('removes direct client DML and every historical mutation policy', () => {
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE[\s\S]*public\.homepage_sections,[\s\S]*public\.homepage_elements[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    for (const table of ['sections', 'elements']) {
      for (const suffix of ['manage', 'insert', 'update', 'delete']) {
        expect(sql).toContain(`DROP POLICY IF EXISTS "homepage_${table}_admin_${suffix}"`)
      }
    }
    expect(sql).toContain("cmd IN ('INSERT','UPDATE','DELETE','ALL')")
    expect(sql).toContain("has_any_column_privilege(v_role, 'public.homepage_elements', 'UPDATE')")
  })

  it('exposes one fixed-search-path definer RPC to service_role only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.mutate_admin_homepage\([\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/)
    expect(sql).toContain("COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'")
    expect(sql).toContain("public.has_permission(p_user_id, 'admin.homepage.edit')")
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.mutate_admin_homepage\(uuid,uuid,text,jsonb\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.mutate_admin_homepage\(uuid,uuid,text,jsonb\)[\s\S]*TO service_role/)
    expect(sql).toContain("has_function_privilege('authenticated', 'public.mutate_admin_homepage(uuid,uuid,text,jsonb)', 'EXECUTE')")
  })

  it('binds actor, request UUID, operation and payload hash for strict replay semantics', () => {
    expect(sql).toMatch(/PRIMARY KEY \(actor_id, request_id\)/)
    expect(sql).toContain("jsonb_build_object('operation', p_operation, 'payload', p_payload)")
    expect(sql).toContain("'homepage-admin-request:' || p_user_id::text || ':' || p_request_id::text")
    expect(sql).toMatch(/v_existing\.operation IS DISTINCT FROM p_operation[\s\S]*v_existing\.payload_hash IS DISTINCT FROM v_hash/)
    expect(sql).toContain("RETURN v_existing.result || jsonb_build_object('replayed', true)")
    expect(sql).toMatch(/INSERT INTO public\.homepage_admin_mutation_requests[\s\S]*RETURN v_result/)
  })

  it('keeps mutation, immutable request result and admin audit in one transaction', () => {
    expect(sql).toMatch(/BEGIN;[\s\S]*CREATE OR REPLACE FUNCTION public\.mutate_admin_homepage[\s\S]*INSERT INTO public\.admin_logs[\s\S]*INSERT INTO public\.homepage_admin_mutation_requests[\s\S]*COMMIT;/)
    expect(sql).toContain("'requestId', p_request_id")
    expect(sql).toContain("'payloadHash', v_hash")
    expect(sql).toContain('Audit basarisizsa mutasyon da rollback olur')
  })

  it('makes reorder a locked full-list permutation and one set-based update', () => {
    const reorder = sql.slice(
      sql.indexOf("ELSIF p_operation = 'elements_reorder'"),
      sql.indexOf('ELSE\n    -- publish'),
    )
    expect(reorder).toContain('FOR UPDATE')
    expect(reorder).toContain('reorder must contain every section element exactly once')
    expect(reorder).toMatch(/UPDATE public\.homepage_elements AS e[\s\S]*WITH ORDINALITY AS requested\(id, ordinality\)/)
    expect(reorder.match(/UPDATE public\.homepage_elements/g)).toHaveLength(1)
    expect(reorder).toContain('atomic reorder failed')
  })

  it('defines action-only publish as all and targeted publish as a non-empty selection', () => {
    expect(sql).toContain("v_scope NOT IN ('all','selection')")
    expect(sql).toContain("IF v_scope = 'all' THEN")
    expect(sql).toContain('all scope cannot include target lists')
    expect(sql).toContain('selection scope requires at least one target')
    expect(sql).toContain('WHERE section_key = v_section_key')
    expect(sql).not.toMatch(/homepage_sections[\s\S]{0,200}\.in\('key'/)
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})
