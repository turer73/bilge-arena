import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '..', 'migrations', '093_reward_integrity.sql'),
  'utf8',
);

describe('093 reward integrity migration', () => {
  it('creates an append-only, own-readable reward ledger with a source identity', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.reward_ledger/i);
    expect(sql).toMatch(/UNIQUE \(source_type, source_id, reward_type, reward_key\)/i);
    expect(sql).toMatch(/ALTER TABLE public\.reward_ledger ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.reward_ledger FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\.reward_ledger[\s\S]*service_role/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.reward_ledger TO authenticated/i);
    expect(sql).toMatch(/FOR SELECT TO authenticated[\s\S]*auth\.uid\(\)\) = user_id/i);
  });

  it('makes xp_log read-only for client roles', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.xp_log FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.xp_log TO authenticated/i);
    expect(sql).toMatch(/DROP POLICY IF EXISTS xp_own ON public\.xp_log/i);
    expect(sql).toMatch(/CREATE POLICY xp_log_own_select ON public\.xp_log[\s\S]*FOR SELECT TO authenticated/i);
  });

  it('links new achievements to the session that earned them', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS source_session_id uuid/i);
    expect(sql).toMatch(/FOREIGN KEY \(source_session_id\)[\s\S]*REFERENCES public\.game_sessions\(id\)/i);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS user_achievements_source_session_idx/i);
  });

  it('keeps verified-session rewards private, lock-based, and trigger-scoped', () => {
    const header = sql.match(/CREATE OR REPLACE FUNCTION public\.apply_verified_session_rewards[\s\S]*?AS \$function\$/i)?.[0] ?? '';
    expect(header).toMatch(/SECURITY DEFINER/i);
    expect(header).toMatch(/SET search_path = pg_catalog/i);
    expect(sql).toMatch(/FOR UPDATE OF va, gs/i);
    expect(sql).toMatch(/v_game IS DISTINCT FROM v_session_game/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.apply_verified_session_rewards\(uuid, uuid\)[\s\S]*service_role/i);
    expect(sql).toMatch(/AFTER UPDATE OF completed_at, session_id ON public\.verified_attempts/i);
    expect(sql).toMatch(/OLD\.completed_at IS NULL[\s\S]*OLD\.session_id IS NULL[\s\S]*NEW\.completed_at IS NOT NULL[\s\S]*NEW\.session_id IS NOT NULL/i);
  });

  it('uses Istanbul-date quest progress and records only new exact badge rewards', () => {
    expect(sql).toContain("clock_timestamp() AT TIME ZONE 'Europe/Istanbul'");
    expect(sql).toMatch(/v_session_correct_streak/i);
    expect(sql).toMatch(/FROM public\.session_answers AS sa/i);
    expect(sql).toMatch(/ORDER BY sa\.question_order NULLS LAST, sa\.question_id/i);
    // The UPDATE's RETURNING data is the only same-statement source that sees
    // its new state under PostgreSQL's MVCC snapshot rules.
    expect(sql).toMatch(/RETURNING udq\.id, dq\.slug, udq\.is_completed/i);
    expect(sql).toMatch(/FROM changed_quests\s+WHERE changed_quests\.is_completed IS TRUE/i);
    expect(sql).not.toMatch(/JOIN public\.user_daily_quests AS udq ON udq\.id = changed_quests\.id/i);
    expect(sql).toMatch(/ON CONFLICT \(user_id, achievement_id\) DO NOTHING/i);
    expect(sql).toMatch(/PERFORM public\.increment_xp\(v_user_id, v_badge_xp, 'badge_earned', p_session_id\)/i);
    for (const badge of ['first_game', 'hundred_games', 'first_correct', 'thousand_correct', 'daily_first', 'login_100', 'mp_five_firsts']) {
      expect(sql).toContain(`'${badge}'`);
    }
  });

  it('limits quest claims to service role and returns replay-stable camelCase JSON', () => {
    const claim = sql.match(/CREATE OR REPLACE FUNCTION public\.claim_daily_quest_reward[\s\S]*?END;\s*\$claim\$/i)?.[0] ?? '';
    expect(claim).toMatch(/FOR UPDATE OF udq/i);
    expect(claim).toMatch(/daily quest owner mismatch[\s\S]*42501/i);
    expect(claim).toMatch(/SET xp_claimed = true/i);
    expect(claim).toMatch(/public\.increment_xp\(p_user_id, v_xp_earned, 'daily_quest', p_user_quest_id\)/i);
    expect(claim).toMatch(/public\.increment_coins\(p_user_id, v_coins_earned\)/i);
    expect(claim).toMatch(/GREATEST\(5, LEAST\(25, ROUND\(v_xp_earned::numeric \* 0\.2\)::integer\)\)/i);
    expect(claim).toMatch(/'xpEarned'[\s\S]*'coinsEarned'[\s\S]*'alreadyProcessed'/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_daily_quest_reward\(uuid, uuid\)[\s\S]*TO service_role/i);
  });
});
