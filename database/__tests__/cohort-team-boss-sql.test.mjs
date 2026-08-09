import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '103_cohort_team_boss.sql'), 'utf8');

describe('103 cohort team boss SQL contract', () => {
  it('is a service-only, owner-scoped, read-only definer RPC', () => {
    expect(sql).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/);
    expect(sql).toMatch(/auth\.uid\(\).*p_user_id/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_my_weekly_team_boss\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_my_weekly_team_boss\(uuid\) TO service_role/);
    expect(sql).not.toMatch(/\b(?:CREATE TABLE|CREATE TRIGGER|INSERT|UPDATE|DELETE)\b/i);
  });
  it('uses exact R3.1 contribution membership integrity and boss arithmetic', () => {
    expect(sql).toMatch(/v_member_count NOT BETWEEN 20 AND 30/);
    expect(sql).toMatch(/v_target := v_member_count \* 30/);
    expect(sql).toMatch(/m\.id=c\.membership_id AND m\.user_id=c\.user_id AND m\.cohort_id=c\.cohort_id/);
    expect(sql).toMatch(/id=v_member\.cohort_id AND week_start=v_member\.week_start/);
    expect(sql).toMatch(/m\.cohort_id=v_member\.cohort_id AND m\.week_start=v_member\.week_start/);
    expect(sql).toMatch(/c\.points>0/);
    expect(sql).toMatch(/v_progress := least\(v_total,v_target\)/);
    expect(sql).toMatch(/v_percent := least\(100,greatest\(0,\(v_progress\*100\)\/v_target\)\)/);
    expect(sql).toMatch(/v_owner := least\(210,greatest\(0,v_owner\)\)/);
    expect(sql).toMatch(/WHEN v_progress=v_target THEN 'defeated'/);
  });
  it('keeps null statuses and strict privacy-only JSON', () => {
    expect(sql).toMatch(/'status','opted_out','weekStart',NULL,'boss',NULL,'team',NULL/);
    for (const key of ['name','phase','target','progress','remaining','progressPercent','defeated','memberCount','activeMemberCount','ownerContribution','cohortOnly','individualsHidden','verifiedOnly','rewardFree']) expect(sql).toContain(`'${key}'`);
    expect(sql).not.toMatch(/'userId'|'sessionId'|'attemptId'|'cohortId'|'membershipId'|'avatarUrl'|'entries'/);
  });
  it('keeps the PL/pgSQL function terminator distinct from the SQL transaction terminator', () => {
    expect(sql).toMatch(/\nEND;\s*\n\$fn\$;[\s\S]*\nCOMMIT;/);
  });
});
