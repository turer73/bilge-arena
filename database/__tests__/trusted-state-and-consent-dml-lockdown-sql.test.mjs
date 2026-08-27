import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/172_trusted_state_and_consent_dml_lockdown.sql', import.meta.url),
  'utf8',
)

describe('migration 172 trusted state and consent DML lockdown', () => {
  it('revokes inherited table and column writes from every sensitive state table', () => {
    for (const table of [
      'badges', 'client_logs', 'consent_logs', 'daily_quests',
      'leaderboard_weekly', 'premium_waitlist', 'user_achievements',
      'user_badges', 'user_daily_quests', 'user_reports',
    ]) expect(sql).toContain(`public.${table}`)

    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/)
    expect(sql).toContain('REVOKE INSERT (%I), UPDATE (%I) ON TABLE public.%I')
    expect(sql).toContain('has_any_column_privilege')
  })

  it('keeps only the route writers and read-only user policies', () => {
    for (const table of [
      'client_logs', 'premium_waitlist',
      'user_daily_quests', 'user_reports',
    ]) expect(sql).toContain(`GRANT INSERT ON TABLE public.${table} TO service_role;`)
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.consent_logs TO service_role;')

    expect(sql).toContain('CREATE POLICY "user_daily_quests_select_own"')
    expect(sql).toContain('CREATE POLICY "user_badges_select_own"')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_consent_logs_legal_intent_type')
    expect(sql).toContain("consent_value ->> 'intentId'")
    expect(sql).toContain('REVOKE SELECT ON TABLE public.premium_waitlist FROM PUBLIC, anon, authenticated;')
    expect(sql).toContain('REVOKE SELECT (%I) ON TABLE public.premium_waitlist')
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE)[^;]+TO (?:anon|authenticated)/i)
  })

  it('binds daily quest claims to verified completion evidence and current active state', () => {
    expect(sql).toContain("evidence.source_type = 'daily_quest_completion'")
    expect(sql).toContain("evidence.reward_type = 'progress'")
    expect(sql).toContain("evidence.reward_key = 'completed'")
    expect(sql).toContain("AT TIME ZONE 'Europe/Istanbul'")
    expect(sql).toContain('v_quest.is_active IS NOT TRUE')
    expect(sql).toContain('v_quest.has_verified_completion IS NOT TRUE')
    expect(sql).toContain("'completionEvidence', 'verified_session'")
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_daily_quest_reward(uuid, uuid)')
  })

  it('self-verifies browser denial, service minimums, policies, and RPC grants', () => {
    expect(sql).toContain("FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']")
    expect(sql).toContain("AND cmd <> 'SELECT'")
    expect(sql).toContain("has_function_privilege(")
    expect(sql).toContain("'public.claim_daily_quest_reward(uuid,uuid)'")
    expect(sql).toContain("has_any_column_privilege('authenticated', 'public.premium_waitlist', 'SELECT')")
    expect(sql).toContain("has_table_privilege('service_role', 'public.consent_logs', 'SELECT')")
    expect(sql).toContain("to_regclass('public.ux_consent_logs_legal_intent_type')")
    expect(sql).toMatch(/BEGIN;[\s\S]+COMMIT;/)
  })
})
