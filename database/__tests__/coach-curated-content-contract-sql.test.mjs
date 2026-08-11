import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '110_coach_curated_content_contract.sql'),
  'utf8',
)

describe('110 curated coach content SQL contract', () => {
  it('backfills only complete active legacy outcome evidence idempotently', () => {
    expect(sql).toContain('WITH valid_legacy_questions AS')
    expect(sql).toContain('count(*) BETWEEN 1 AND 5')
    expect(sql).toContain('count(*) FILTER (WHERE qo.is_primary) = 1')
    expect(sql).toContain('bool_and(qo.weight <= 1)')
    expect(sql).toContain('JOIN public.curriculum_outcomes co ON co.id = qo.outcome_id AND co.is_active')
    expect(sql).toContain('ON CONFLICT (revision_id, outcome_id) DO NOTHING')
  })

  it('keeps every 106 payload rule behind an idempotent wrapper', () => {
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS app_private')
    expect(sql).toContain('REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated, service_role')
    expect(sql).toContain("to_regprocedure('app_private.content_governance_validate_payload_base_v106(jsonb)') IS NULL")
    expect(sql).toContain('SET SCHEMA app_private')
    expect(sql).toContain('RENAME TO content_governance_validate_payload_base_v106')
    expect(sql).toContain('app_private.content_governance_validate_payload_base_v106(v_base_payload)')
    expect(sql).toContain("jsonb_set(p_payload, '{content}', v_content - 'coach', false)")
  })

  it('accepts only the exact complete coach envelope', () => {
    expect(sql).toContain("ARRAY['hint1','hint2','miniExample','misconceptions']")
    expect(sql).toContain("jsonb_typeof(v_coach->'misconceptions') <> 'array'")
    expect(sql).toContain('jsonb_array_length(v_misconceptions) <> jsonb_array_length')
    expect(sql).toContain("char_length(btrim(v_coach->>'hint1')) NOT BETWEEN 1 AND 700")
  })

  it('requires null at the correct option and nonempty text at every wrong option', () => {
    expect(sql).toContain("WHEN position - 1 = v_answer THEN jsonb_typeof(value) <> 'null'")
    expect(sql).toContain("ELSE jsonb_typeof(value) <> 'string'")
    expect(sql).toContain("char_length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 1000")
  })

  it('rejects executable markup and secret or prompt leakage markers', () => {
    expect(sql).toContain('(script|iframe|style)([[:space:]>]|$)')
    expect(sql).toContain('(^|[^[:alnum:]_])(system prompt|api key|service[ _-]?role|deepseek_api_key|supabase_service_role_key)')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.content_governance_validate_payload\(jsonb\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
  })
})
