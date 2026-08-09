// Static regression guard for migration 091 (verified attempts foundation).
// This test reads the migration SQL file and asserts durable security and
// validation invariants without any database connection or network access.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, '..', 'migrations', '091_verified_attempts.sql');
const sql = readFileSync(migrationPath, 'utf8');

describe('migration 091 verified_attempts static invariants', () => {
  it('creates verified_attempts table idempotently with RLS enabled', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.verified_attempts/);
    expect(sql).toMatch(/ALTER TABLE public\.verified_attempts ENABLE ROW LEVEL SECURITY/);
  });

  it('revokes all table privileges from PUBLIC, anon, authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.verified_attempts FROM PUBLIC, anon, authenticated/);
  });

  it('creates issue_verified_attempt as SECURITY DEFINER with service_role-only grant', () => {
    const startIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.issue_verified_attempt');
    const endIdx = sql.indexOf('AS $$', startIdx);
    const header = sql.slice(startIdx, endIdx + 4);
    expect(header).toContain('SECURITY DEFINER');
    expect(header).toContain('SET search_path = pg_catalog');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.issue_verified_attempt\(uuid, text, text, uuid\[\], integer\)\s+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.issue_verified_attempt\(uuid, text, text, uuid\[\], integer\)\s+TO service_role/);
  });

  it('constrains duration_sec to 5..7200', () => {
    expect(sql).toMatch(/duration_sec integer NOT NULL CHECK \(duration_sec BETWEEN 5 AND 7200\)/);
  });

  it('constrains question_ids to non-null unique array of 1..100 via immutable helper', () => {
    expect(sql).toMatch(/question_ids uuid\[\] NOT NULL CHECK \(public\.verified_attempts_question_ids_valid\(question_ids\)\)/);
    expect(sql).toMatch(/cardinality\(p_question_ids\) BETWEEN 1 AND 100/);
    expect(sql).toMatch(/WHERE q IS NOT NULL/);
    expect(sql).toMatch(/COUNT\(DISTINCT q\)/);
  });

  it('constrains allowed modes to the existing set', () => {
    expect(sql).toMatch(/mode text NOT NULL CHECK \(mode IN \('classic', 'blitz', 'marathon', 'boss', 'practice', 'deneme'\)\)/);
  });

  it('constrains game to the actual game set', () => {
    expect(sql).toMatch(/game text NOT NULL CHECK \(game IN \('wordquest', 'matematik', 'turkce', 'fen', 'sosyal'\)\)/);
  });

  it('constrains expires_at > started_at', () => {
    expect(sql).toMatch(/expires_at timestamptz NOT NULL CHECK \(expires_at > started_at\)/);
  });

  it('does not embed SELECT/subquery directly in any CHECK clause', () => {
    const checkClauses = sql.match(/CHECK\s*\([^)]*\)/g) || [];
    for (const clause of checkClauses) {
      expect(clause).not.toMatch(/\bSELECT\b/i);
      expect(clause).not.toMatch(/EXISTS\s*\(/i);
      expect(clause).not.toMatch(/ARRAY\s*\(/i);
    }
  });

  it('validates duplicate input as SQLSTATE 22023 in the function', () => {
    expect(sql).toMatch(/question_ids cannot contain duplicates/);
    expect(sql).toMatch(/ERRCODE = '22023'/);
  });

  it('proves every issued ID is an active question for the bound game via set-based COUNT', () => {
    expect(sql).toMatch(/FROM public\.questions/);
    expect(sql).toMatch(/WHERE id = ANY\(p_question_ids\)/);
    expect(sql).toMatch(/AND game = p_game/);
    expect(sql).toMatch(/AND is_active = true/);
    expect(sql).toMatch(/v_active_count <> cardinality\(p_question_ids\)/);
    expect(sql).not.toMatch(/FOREACH/);
  });

  it('uses make_interval for duration, not string concatenation', () => {
    expect(sql).toMatch(/make_interval\(secs => p_duration_sec\)/);
    expect(sql).not.toMatch(/interval '\|\|/);
  });

  it('uses fixed search_path and unambiguous parameter prefixes', () => {
    const startIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.issue_verified_attempt');
    const endIdx = sql.indexOf('AS $$', startIdx);
    const header = sql.slice(startIdx, endIdx + 4);
    expect(header).toContain('SET search_path = pg_catalog');
    expect(sql).toMatch(/p_user_id uuid/);
    expect(sql).toMatch(/p_game text/);
    expect(sql).toMatch(/p_mode text/);
    expect(sql).toMatch(/p_question_ids uuid\[\]/);
    expect(sql).toMatch(/p_duration_sec integer/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.issue_verified_attempt\(\s*user_id/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.issue_verified_attempt\(\s*game/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.issue_verified_attempt\(\s*mode/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.issue_verified_attempt\(\s*question_ids/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.issue_verified_attempt\(\s*duration_sec/);
  });

  it('revokes helper function EXECUTE from client roles', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.verified_attempts_question_ids_valid\(uuid\[\]\)\s+FROM PUBLIC, anon, authenticated/);
  });

  it('includes NOTIFY pgrst and rollback comment', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/);
    expect(sql).toMatch(/Rollback:/);
    expect(sql).toMatch(/DROP TABLE public\.verified_attempts/);
    expect(sql).toMatch(/DROP FUNCTION public\.issue_verified_attempt\(uuid, text, text, uuid\[\], integer\)/);
  });

  it('does not add redundant question_ids IS NOT NULL CHECK', () => {
    expect(sql).not.toMatch(/CHECK \(question_ids IS NOT NULL\)/);
  });

  it('uses clock_timestamp for started_at and expires_at computation', () => {
    expect(sql).toMatch(/started_at timestamptz NOT NULL DEFAULT clock_timestamp\(\)/);
    expect(sql).toMatch(/v_expires_at := clock_timestamp\(\) \+ make_interval/);
  });

  it('adds state consistency constraint between completed_at and session_id', () => {
    expect(sql).toMatch(/CONSTRAINT verified_attempts_completion_consistency/);
    expect(sql).toMatch(
      /CHECK\s*\(\s*\(completed_at IS NULL AND session_id IS NULL\)\s*OR\s*\(completed_at IS NOT NULL AND session_id IS NOT NULL\)\s*\)/,
    );
  });
});
