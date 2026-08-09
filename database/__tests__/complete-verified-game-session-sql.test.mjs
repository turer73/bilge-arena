// Static regression guard for migration 092 (complete_verified_game_session wrapper).
// This test reads the migration SQL file and asserts durable security and
// validation invariants without any database connection or network access.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, '..', 'migrations', '092_complete_verified_game_session.sql');
const sql = readFileSync(migrationPath, 'utf8');
const normalizeSql = (value) => value.replace(/\s+/g, ' ').trim().replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

describe('migration 092 complete_verified_game_session static invariants', () => {
  const wrapperStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_verified_game_session(');
  const bodyStart = sql.indexOf('AS $$', wrapperStart) + 4;
  const bodyEnd = sql.indexOf('$$;', bodyStart);
  const wrapperHeader = sql.slice(wrapperStart, bodyStart);
  const wrapperBody = sql.slice(bodyStart, bodyEnd);
  const normalizedSql = normalizeSql(sql);
  const normalizedHeader = normalizeSql(wrapperHeader);

  it('is a single-transaction migration with BEGIN/COMMIT', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });

  it('revokes the old 14-arg function from all roles including service_role', () => {
    const oldSig = 'UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER, SMALLINT, SMALLINT, INTEGER, NUMERIC';
    const revokeOld = `REVOKE EXECUTE ON FUNCTION public.complete_game_session(${oldSig}) FROM PUBLIC, anon, authenticated, service_role;`;
    expect(normalizedSql).toContain(normalizeSql(revokeOld));
  });

  it('wrapper function has SECURITY DEFINER and pg_catalog search_path', () => {
    expect(wrapperHeader).toContain('SECURITY DEFINER');
    expect(wrapperHeader).toContain('SET search_path = pg_catalog');
  });

  it('wrapper function has exact 15 parameters', () => {
    const params = [
      'p_attempt_id UUID', 'p_user_id UUID', 'p_client_request_id UUID',
      'p_game TEXT', 'p_mode TEXT', 'p_category TEXT',
      'p_filter_difficulty SMALLINT', 'p_answers JSONB',
      'p_total_xp INTEGER', 'p_base_xp INTEGER', 'p_bonus_xp INTEGER',
      'p_correct_count SMALLINT', 'p_wrong_count SMALLINT',
      'p_time_spent_sec INTEGER', 'p_avg_time_sec NUMERIC',
    ];
    for (const param of params) {
      expect(normalizedHeader).toContain(normalizeSql(param));
    }
    const wrapperSig = 'UUID, UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER, SMALLINT, SMALLINT, INTEGER, NUMERIC';
    const revokeWrapper = `REVOKE EXECUTE ON FUNCTION public.complete_verified_game_session(${wrapperSig}) FROM PUBLIC, anon, authenticated;`;
    const grantWrapper = `GRANT EXECUTE ON FUNCTION public.complete_verified_game_session(${wrapperSig}) TO service_role;`;
    expect(normalizedSql).toContain(normalizeSql(revokeWrapper));
    expect(normalizedSql).toContain(normalizeSql(grantWrapper));
  });

  it('uses FOR UPDATE lock on the verified attempt', () => {
    expect(wrapperBody).toMatch(/FOR UPDATE/);
  });

  it('performs NULL-safe owner check with IS DISTINCT FROM', () => {
    expect(wrapperBody).toMatch(/v_attempt\.user_id IS DISTINCT FROM p_user_id/);
  });

  it('performs NULL-safe game and mode check with IS DISTINCT FROM', () => {
    expect(wrapperBody).toMatch(/v_attempt\.game IS DISTINCT FROM p_game OR v_attempt\.mode IS DISTINCT FROM p_mode/);
  });

  it('replay path returns early with numeric fields and alreadyProcessed true', () => {
    const replaySection = wrapperBody.slice(
      wrapperBody.indexOf('-- Replay path'),
      wrapperBody.indexOf('-- Fresh path'),
    );
    expect(replaySection).toMatch(/RETURN jsonb_build_object/);
    expect(replaySection).not.toMatch(/complete_game_session/);
    expect(replaySection).toMatch(/'sessionId'/);
    expect(replaySection).toMatch(/'totalXP'/);
    expect(replaySection).toMatch(/'correctCount'/);
    expect(replaySection).toMatch(/'wrongCount'/);
    expect(replaySection).toMatch(/'alreadyProcessed', true/);
    const delegateCallIdx = wrapperBody.indexOf('v_result := public.complete_game_session(');
    const replayReturnIdx = wrapperBody.indexOf('RETURN jsonb_build_object');
    expect(replayReturnIdx).toBeLessThan(delegateCallIdx);
  });

  it('checks attempt expiry with clock_timestamp', () => {
    expect(wrapperBody).toMatch(/v_attempt\.expires_at <= clock_timestamp\(\)/);
  });

  it('validates p_answers as non-empty JSON array', () => {
    expect(wrapperBody).toMatch(/p_answers IS NULL OR jsonb_typeof\(p_answers\) <> 'array' OR jsonb_array_length\(p_answers\) = 0/);
  });

  it('explicitly rejects missing question_id and non-canonical UUIDs', () => {
    const check = wrapperBody.match(/WHERE\s*\(elem->>'question_id'\) IS NULL\s*OR\s*\(elem->>'question_id'\) !~\* '[^']+'/);
    expect(check).toBeTruthy();
    expect(wrapperBody).toMatch(/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/);
  });

  it('detects duplicate question_ids via cardinality and DISTINCT count', () => {
    expect(wrapperBody).toMatch(/cardinality\(v_submitted_ids\) != \(SELECT COUNT\(DISTINCT uid\) FROM unnest\(v_submitted_ids\) AS uid\)/);
  });

  it('enforces subset of issued question_ids with uid != ALL', () => {
    expect(wrapperBody).toMatch(/uid != ALL\(v_attempt\.question_ids\)/);
  });

  it('checks client_request_id uniqueness per user', () => {
    expect(wrapperBody).toMatch(/WHERE user_id = p_user_id AND client_request_id = p_client_request_id/);
  });

  it('delegates to complete_game_session with all 14 args in correct order', () => {
    const callMatch = wrapperBody.match(/v_result := public\.complete_game_session\(\s*p_user_id,\s*p_client_request_id,\s*p_game,\s*p_mode,\s*p_category,\s*p_filter_difficulty,\s*p_answers,\s*p_total_xp,\s*p_base_xp,\s*p_bonus_xp,\s*p_correct_count,\s*p_wrong_count,\s*p_time_spent_sec,\s*p_avg_time_sec\s*\);/);
    expect(callMatch).toBeTruthy();
  });

  it('requires alreadyProcessed exactly false with IS DISTINCT FROM', () => {
    expect(wrapperBody).toMatch(/\(v_result->>'alreadyProcessed'\) IS DISTINCT FROM 'false'/);
  });

  it('updates verified_attempts exactly once to bind session_id and completed_at', () => {
    const updateCount = (wrapperBody.match(/UPDATE public\.verified_attempts/g) || []).length;
    expect(updateCount).toBe(1);
    expect(wrapperBody).toMatch(/SET session_id = \(v_result->>'sessionId'\)::uuid/);
    expect(wrapperBody).toMatch(/completed_at = clock_timestamp\(\)/);
    expect(wrapperBody).toMatch(/WHERE id = p_attempt_id;/);
  });

  it('includes rollback instructions for wrapper and old function re-grant', () => {
    const rollbackStart = sql.indexOf('-- Rollback');
    const rollbackEnd = sql.indexOf('BEGIN;', rollbackStart);
    const normalizedRollback = normalizeSql(
      sql.slice(rollbackStart, rollbackEnd).replace(/^--\s?/gm, ''),
    );
    const wrapperSig = 'UUID, UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER, SMALLINT, SMALLINT, INTEGER, NUMERIC';
    const oldSig = 'UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, JSONB, INTEGER, INTEGER, INTEGER, SMALLINT, SMALLINT, INTEGER, NUMERIC';
    expect(normalizedRollback).toContain('Rollback');
    expect(normalizedRollback).toContain(
      normalizeSql('DROP FUNCTION IF EXISTS public.complete_verified_game_session(' + wrapperSig + ');'),
    );
    expect(normalizedRollback).toContain(
      normalizeSql('GRANT EXECUTE ON FUNCTION public.complete_game_session(' + oldSig + ') TO service_role;'),
    );
  });

  it('emits NOTIFY pgrst to reload schema', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/);
  });
});
