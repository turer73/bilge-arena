import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '101_relative_weekly_learning_leagues.sql'), 'utf8');

// Mirrors the intentional SQL packing rule: never produce 31+ cohorts, and do
// not make undersized cohorts just to exhaust a partition.
function pack(count) {
  if (count < 20) return { groups: [], waiting: count };
  const groupCount = count < 40 ? 1 : Math.ceil(count / 30);
  const groups = Array.from({ length: groupCount }, (_, index) =>
    count < 40 ? Math.min(30, count) : Math.floor(count / groupCount) + (index < count % groupCount ? 1 : 0),
  );
  return { groups, waiting: count - groups.reduce((a, b) => a + b, 0) };
}

describe('101 relative weekly learning leagues SQL contract', () => {
  it('uses default-off private RLS tables and only service RPC access', () => {
    expect(sql).toMatch(/opted_in boolean NOT NULL DEFAULT false/);
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(7);
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]*?PUBLIC, anon, authenticated, service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role/);
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE).*weekly_learning_league.*TO service_role/i);
  });

  it('has canonical replay, Istanbul boundaries, locked verified contribution and immutable finals', () => {
    expect(sql).toMatch(/Europe\/Istanbul/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/FOR UPDATE OF m/);
    expect(sql).toMatch(/session_id uuid PRIMARY KEY/);
    expect(sql).toMatch(/least\(greatest\(v_correct, 0\), 15, greatest\(30 - v_used, 0\)\)/);
    expect(sql).toMatch(/AFTER UPDATE OF completed_at, session_id ON public\.verified_attempts/);
    expect(sql).toMatch(/final_rank = ranked\.rnk/);
    expect(sql).toMatch(/final_zone = CASE WHEN ranked\.rnk <= 3/);
    expect(sql).toMatch(/weekly_learning_league_formation_requests/);
    expect(sql).toMatch(/weekly_learning_league_preference_requests/);
    expect(sql).toMatch(/preference request payload mismatch/);
    expect(sql).toMatch(/wll-preference-request:/);
    expect(sql).not.toMatch(/WHERE request_id = p_request_id OR week_start = p_week_start/);
    expect(sql).toMatch(/WHERE p\.deleted_at IS NULL/);
  });

  it('packs every documented cohort boundary deterministically', () => {
    for (const [n, groups, waiting] of [[0, [], 0], [19, [], 19], [20, [20], 0], [30, [30], 0], [31, [30], 1], [39, [30], 9], [40, [20, 20], 0], [60, [30, 30], 0]]) {
      expect(pack(n)).toEqual({ groups, waiting });
    }
    for (let n = 0; n <= 240; n += 1) {
      const result = pack(n);
      expect(result.groups.every((size) => size >= 20 && size <= 30)).toBe(true);
    }
  });

  it('keeps the exact privacy-safe output contract and redacts blocks/bottom identities', () => {
    for (const key of ['status', 'optedIn', 'effectiveWeekStart', 'startsOn', 'endsOn', 'memberCount', 'isFinal', 'entries', 'bottomHidden', 'sessionCap', 'dailyCap']) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toMatch(/'Gizli Arenacı'/);
    expect(sql).toMatch(/NULLIF\(btrim\(p\.display_name\),''\)/);
    expect(sql).toMatch(/p\.deleted_at IS NOT NULL OR EXISTS/);
    expect(sql).toMatch(/left\(p\.avatar_url,1\)='\/' AND left\(p\.avatar_url,2\)<>'\/\/'/);
    expect(sql).toMatch(/supabase\\.co\/storage\/v1\/object\/public/);
    expect(sql).toMatch(/googleusercontent\\.com/);
    expect(sql).toMatch(/rnk <= v_count - 3/);
    expect(sql).toMatch(/'zone',v_entry_zone|entry_zone/);
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*'userId'/);
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*'sessionId'/);
  });
});
