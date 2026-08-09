import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '102_positive_learning_spotlights.sql'), 'utf8');

describe('102 positive learning spotlights SQL contract', () => {
  it('is read-only, indexed, definer-hardened and service-only', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS verified_attempts_completed_user_at_idx[\s\S]*\(user_id, completed_at\)[\s\S]*completed_at IS NOT NULL AND session_id IS NOT NULL/);
    expect(sql).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/);
    expect(sql).toMatch(/END;\s*\$fn\$;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_my_weekly_learning_spotlights\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_my_weekly_learning_spotlights\(uuid\) TO service_role/);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO\s+public\.(?:weekly_learning_league|profiles|game_sessions|verified_attempts|xp_|reward)/i);
  });

  it('uses only owned completed verified sessions and exact positive thresholds', () => {
    expect(sql).toMatch(/va\.completed_at IS NOT NULL AND va\.session_id IS NOT NULL/);
    expect(sql).toMatch(/gs\.id = va\.session_id AND gs\.user_id = cu\.user_id AND gs\.status = 'completed'/);
    expect(sql).toMatch(/max\(\(va\.completed_at[\s\S]*?FILTER \([\s\S]*?gs\.id IS NOT NULL[\s\S]*?gs\.total_questions > 0[\s\S]*?\) AS last_prior_day/);
    expect(sql).toMatch(/current_answered >= 10 AND active_days >= 2 AND baseline_answered >= 20/);
    expect(sql).toMatch(/current_score > baseline_score/);
    expect(sql).toMatch(/round\(current_score - baseline_score\)::integer/);
    expect(sql).toMatch(/last_prior_day IS NOT NULL AND last_prior_day <= v_week_start - 7/);
    expect(sql).toMatch(/dense_rank\(\) OVER \(ORDER BY active_days DESC\)/);
  });

  it('enforces cohort owner scope, top3 plus owner privacy, redaction and strict JSON fields', () => {
    expect(sql).toMatch(/auth\.uid\(\).*p_user_id/);
    expect(sql).toMatch(/m\.cohort_id = v_member\.cohort_id/);
    expect(sql).toMatch(/x\.display_order<=3 OR x\.user_id=p_user_id/g);
    expect(sql).toMatch(/p\.deleted_at IS NOT NULL OR EXISTS/);
    expect(sql).toMatch(/left\(p\.avatar_url,1\)='\/' AND left\(p\.avatar_url,2\)<>'\/\/'/);
    for (const key of ['status', 'weekStart', 'boards', 'improved', 'consistent', 'comeback', 'eligible', 'rank', 'value', 'entries', 'cohortOnly', 'positiveOnly', 'verifiedOnly', 'fullTableHidden']) expect(sql).toContain(`'${key}'`);
    expect(sql).not.toMatch(/'userId'|'sessionId'|'attemptId'|'cohortId'|'membershipId'/);
  });

  it('keeps the final nested boards expression and PL/pgSQL body structurally closed', () => {
    expect(sql).toMatch(/comeback_entries[\s\S]*?'\[\]'::jsonb\)\)\)\s*\n\s*INTO v_boards;/);
    expect(sql).toMatch(/\nEND;\s*\n\$fn\$;/);
  });
});
