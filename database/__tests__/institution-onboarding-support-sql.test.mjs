import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '125_institution_onboarding_and_support_access.sql'),
  'utf8',
)

describe('125 institution onboarding and support SQL contract', () => {
  it('keeps support access private, read-only, expiring and manager-controlled', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.institution_support_grants')
    expect(sql).toContain("scope text NOT NULL DEFAULT 'read_only' CHECK (scope = 'read_only')")
    expect(sql).toContain("expires_at <= granted_at + interval '24 hours'")
    expect(sql).toMatch(/membership\.role = 'manager'/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.institution_support_grants[\s\S]+service_role/)
    expect(sql).not.toMatch(/GRANT (SELECT|INSERT|UPDATE|DELETE) ON (TABLE )?public\.institution_support_grants/)
  })

  it('requires both platform permission and an active unrevoked grant', () => {
    expect(sql).toContain("permission.permission = 'institution.support.access'")
    expect(sql).toContain('support_grant.revoked_at IS NULL')
    expect(sql).toContain('support_grant.expires_at > clock_timestamp()')
    expect(sql).toContain('get_institution_support_directory')
    expect(sql).toContain('institution_support_has_access(p_admin_user_id, p_institution_id)')
    expect(sql).not.toMatch(/'email'|'phone'|'answer'|'selectedOption'|'correctOption'/)
  })

  it('keeps grant and revoke writes idempotent and service-only', () => {
    expect(sql).toContain("operation = 'grant_support_access'")
    expect(sql).toContain("operation = 'revoke_support_access'")
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
  })
})
