import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  join(here, '..', 'migrations', '089_fix_handle_new_user_long_email.sql'),
  'utf8',
);
const diagnostic = readFileSync(join(here, '..', 'diagnose-auth-create-user.sql'), 'utf8');
const smokeHarness = readFileSync(join(here, '..', 'smoke-auth-create-user-trigger.mjs'), 'utf8');
const referralMigration = readFileSync(join(here, '..', 'migrations', '015_referral_system.sql'), 'utf8');

describe('089 handle_new_user regression guard', () => {
  it('processes an email local-part in TEXT before constructing a bounded username', () => {
    expect(migration).toMatch(/v_email_local_part\s+TEXT/i);
    expect(migration).toMatch(/v_email_local_part\s*:=\s*pg_catalog\.lower/is);
    expect(migration).toMatch(/pg_catalog\.left\(v_username_base,\s*21\)/is);
    expect(migration).toMatch(/v_username\s*:=.*pg_catalog\.left\([\s\S]*30[\s\S]*\)\s*\|\|\s*pg_catalog\.lpad/is);
    expect(migration).not.toMatch(/v_username\s*:=\s*(?:pg_catalog\.)?lower\s*\(/i);
  });

  it('preserves the auth trigger while hardening its SECURITY DEFINER function', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = ''/i);
    expect(migration).toMatch(/INSERT INTO public\.profiles/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.handle_new_user\(\) TO supabase_auth_admin/i);
    expect(migration).not.toMatch(/DROP\s+TRIGGER/i);
    expect(migration).not.toMatch(/CREATE\s+TRIGGER/i);
  });

  it('bounds display_name and retries username or referral-code unique collisions', () => {
    expect(migration).toMatch(/pg_catalog\.left\([\s\S]*64\s*\)/is);
    expect(migration).toMatch(/FOR v_attempt IN 1\.\.12 LOOP/i);
    expect(migration).toMatch(/EXCEPTION WHEN unique_violation/i);
    expect(migration).toMatch(/IF v_attempt = 12 THEN\s+RAISE;/is);
    expect(referralMigration).toMatch(/NEW\.referral_code\s*:=\s*UPPER\(SUBSTR\(MD5\(RANDOM\(\)::TEXT \|\| NEW\.id::TEXT\)/is);
  });

  it('keeps the existing diagnostic rollback-only', () => {
    expect(diagnostic).toMatch(/CREATE TEMP TABLE/i);
    expect(diagnostic).toMatch(/pg_catalog\.gen_random_uuid\(\)/i);
    expect(diagnostic).toMatch(/RAISE EXCEPTION USING[\s\S]*DIAGNOSTIC_INSERT_SUCCEEDED_AND_WAS_ROLLED_BACK/is);
    expect(diagnostic).toMatch(/EXCEPTION WHEN OTHERS/i);
    expect(diagnostic).not.toMatch(/^\s*COMMIT\s*;/mi);
  });

  it('makes the auth-create smoke opt-in and removes only its own profile before auth deletion', () => {
    expect(smokeHarness).toMatch(/ALLOW_PROD_AUTH_CREATE_SMOKE/);
    expect(smokeHarness).toMatch(/I_UNDERSTAND_PROD_WRITE/);
    expect(smokeHarness).toMatch(/full_name: fullName/);
    expect(smokeHarness).toMatch(/longLocalPart\.length <= 32 \|\| longLocalPart\.length > 64/);
    expect(smokeHarness).toMatch(/@example\.com/);
    expect(smokeHarness).toMatch(/for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/);
    expect(smokeHarness).toMatch(/Manual cleanup required for synthetic email/);
    expect(smokeHarness).toMatch(/from\('profiles'\)[\s\S]*delete\(\)[\s\S]*eq\('id', syntheticUserId\)/);
    expect(smokeHarness).toMatch(/delete\(\)[\s\S]*auth\.admin\.deleteUser\(syntheticUserId, false\)/);
  });
});
