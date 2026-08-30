import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/204_postgrest_tombstone_request_gate.sql', import.meta.url),
  'utf8',
)

describe('204 PostgREST tombstone request gate SQL', () => {
  it('registers an idempotent fail-closed Data API pre-request gate', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enforce_active_profile_data_api_request()')
    expect(sql).toContain("v_claim_role IS DISTINCT FROM 'authenticated'")
    expect(sql).toContain('FROM public.profiles AS profile_row')
    expect(sql).toContain('IF NOT FOUND THEN')
    expect(sql).toContain('IF v_deleted_at IS NOT NULL THEN')
    expect(sql).toContain("'code', 'account_deleted'")
    expect(sql).toContain("'status', 410")
    expect(sql.indexOf("current_setting('request.jwt.claims', true)")).toBeLessThan(
      sql.indexOf("current_setting('request.jwt', true)"),
    )
  })

  it('does not silently replace an unrelated live pre-request hook', () => {
    expect(sql).toContain("role_config LIKE 'pgrst.db_pre_request=%'")
    expect(sql).toContain("v_existing <> 'public.enforce_active_profile_data_api_request'")
    expect(sql).toContain("USING ERRCODE = '55000'")
    expect(sql).toContain("SET pgrst.db_pre_request = 'public.enforce_active_profile_data_api_request'")
    expect(sql).toContain("NOTIFY pgrst, 'reload config'")
  })

  it('is definer-hardened and documents its product boundary', () => {
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = pg_catalog')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role, authenticator;')
    expect(sql).toContain('TO anon, authenticated, service_role, authenticator;')
    expect(sql).toMatch(/does not cover Realtime, Storage or Auth endpoints/i)
  })
})
