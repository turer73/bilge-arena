import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const migrationFiles = [
  '087_award_badges_atomic.sql',
  '088_repair_award_badges_concurrency.sql',
];
const migrations = migrationFiles.map((file) => ({
  file,
  sql: readFileSync(join(here, '..', 'migrations', file), 'utf8'),
}));
const badgeCatalog = readFileSync(
  join(here, '..', '..', 'src', 'lib', 'constants', 'badges.ts'),
  'utf8',
);
const smokeHarness = readFileSync(
  join(here, '..', 'smoke-award-badges-concurrency.mjs'),
  'utf8',
);

describe('087 award_badges atomicity guard', () => {
  it('deduplicates and validates inputs before attempting inserts', () => {
    for (const { sql } of migrations) {
      expect(sql).toMatch(/SELECT\s+DISTINCT\s+requested\.code/i);
      expect(sql).toMatch(/INNER\s+JOIN\s+requested_codes/i);
      expect(sql).toMatch(/COALESCE\(p_badge_codes,\s*ARRAY\[\]::TEXT\[\]\)/i);
    }
  });

  it('calculates both returned badges and XP only from successful inserts', () => {
    for (const { sql } of migrations) {
      expect(sql).toMatch(/ON\s+CONFLICT\s*\(user_id,\s*achievement_id\)\s+DO\s+NOTHING\s+RETURNING\s+achievement_id/is);
      expect(sql).toMatch(/FROM\s+inserted_badges\s+INNER\s+JOIN\s+valid_badges/is);
      expect(sql).not.toMatch(/EXCEPTION\s+WHEN\s+unique_violation/i);
    }
  });

  it('increments XP only for positive inserted rewards and keeps RPC hardening', () => {
    for (const { sql } of migrations) {
      expect(sql).toMatch(/IF\s+v_total_xp\s*>\s*0\s+THEN\s+PERFORM\s+public\.increment_xp\(p_user_id,\s*v_total_xp,\s*'badge_earned'\)/is);
      expect(sql).toMatch(/SECURITY\s+DEFINER\s+SET\s+search_path\s+TO\s+'public'/is);
      expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.award_badges/is);
    }
  });

  it('keeps the SQL badge codes and rewards aligned with the TypeScript catalog', () => {
    const catalogPairs = [...badgeCatalog.matchAll(/code:\s*'([^']+)'[^\n]+xpReward:\s*(\d+)/g)]
      .map((match) => `${match[1]}:${match[2]}`)
      .sort();

    expect(catalogPairs).toHaveLength(21);
    for (const { file, sql } of migrations) {
      const sqlPairs = [...sql.matchAll(/\('([^']+)',\s*(\d+)\)/g)]
        .map((match) => `${match[1]}:${match[2]}`)
        .sort();
      expect(sqlPairs, file).toEqual(catalogPairs);
    }
  });

  it('keeps the concurrency smoke harness explicitly opt-in and self-cleaning', () => {
    expect(smokeHarness).toMatch(/ALLOW_PROD_BADGE_SMOKE/);
    expect(smokeHarness).toMatch(/I_UNDERSTAND_PROD_WRITE/);
    expect(smokeHarness).toMatch(/auth\.admin\.createUser/);
    expect(smokeHarness).toMatch(/finally\s*\{[\s\S]*auth\.admin\.deleteUser\(syntheticUserId, false\)/);
    expect(smokeHarness).toMatch(/Promise\.all\(\[\s*[\s\S]*award_badges[\s\S]*award_badges/);
    expect(smokeHarness).toMatch(/SUPABASE_SERVICE_KEY\s*\?\?\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    expect(smokeHarness).toMatch(/from\('xp_log'\)[\s\S]*reason', 'badge_earned'[\s\S]*amount', 50/);
  });
});
