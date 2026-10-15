import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/214_question_quality_model_gate_retention.sql', import.meta.url), 'utf8')

describe('214 model-gate retention SQL contract (Codex review on #523)', () => {
  it('replaces only the compute function, with valid PL/pgSQL', () => {
    const plpgsqlFunctions = migration.match(/LANGUAGE plpgsql[\s\S]*?AS \$fn\$[\s\S]*?\$fn\$;/g) ?? []
    expect(plpgsqlFunctions).toHaveLength(1)
    expect(plpgsqlFunctions[0]).toMatch(/END;\s*\$fn\$;$/)
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.compute_question_quality_consensus(p_case_id uuid)')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.record_question_quality_consensus')
  })

  it('compares thresholds on the exact model-free posterior and rounds only the reported value', () => {
    expect(migration).toContain('posterior_without_model:=1/(1+exp(-(ln(0.02/0.98)+human_llr+proof_llr)));')
    expect(migration).toContain('posterior_without_model_reported:=round(posterior_without_model,9);')
    expect(migration).not.toMatch(/posterior_without_model:=round\(/)
    expect(migration).toContain('IF LEAST(posterior,posterior_without_model)>=0.995')
    expect(migration).toContain("ELSIF LEAST(posterior,posterior_without_model)>=0.98 THEN computed_decision:='quarantine';")
    expect(migration).toContain('ELSIF clean_floor AND GREATEST(posterior,posterior_without_model)<=0.02 THEN')
    expect(migration).toContain("'posteriorWithoutModel',posterior_without_model_reported,")
    expect(migration).not.toMatch(/LEAST\(posterior,posterior_without_model_reported\)|GREATEST\(posterior,posterior_without_model_reported\)/)
  })

  it('retains an existing quarantine or confirmation independently of the gate', () => {
    // The gate label closes on its own; retention is a separate block keyed on state.
    expect(migration).toContain("    model_gate:='held_for_human_review';\n  END IF;\n")
    expect(migration).toContain("IF quality_case.state='confirmed' AND computed_decision<>'confirmed' THEN")
    expect(migration).toContain("ELSIF quality_case.state='quarantined' AND computed_decision NOT IN ('quarantine','confirmed') THEN")
    expect(migration.match(/model_gate:='retained_existing_action';/g)).toHaveLength(2)
    // The 213 form that only ran retention when gated and ungated differed is gone.
    expect(migration).not.toMatch(/IF computed_decision<>ungated_decision THEN\n\s*--[\s\S]*?IF quality_case\.state/)
    expect(migration).not.toContain("AND ungated_decision IN ('quarantine','confirmed')")
  })

  it('keeps floors, thresholds, policy version and snapshot keys of 213', () => {
    expect(migration).toContain('flaw_floor:=independent_users>=5 AND independent_clusters>=5 AND leading_clusters>=3')
    expect(migration).toContain("clean_floor:=independent_users>=5 AND independent_clusters>=5 AND trusted_clean>=3;")
    expect(migration).toContain("'policyVersion','community-quality@2'")
    expect(migration).toContain("'ungatedDecision',ungated_decision,'modelGate',model_gate")
    expect(migration).toContain("inputs_sha:=encode(extensions.digest(snapshot::text,'sha256'),'hex');")
  })

  it('keeps the compute helper internal', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.compute_question_quality_consensus(uuid)')
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.compute_question_quality_consensus/)
  })
})
