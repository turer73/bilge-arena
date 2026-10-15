import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/213_question_quality_model_gate.sql', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../run-community-question-quality.mjs', import.meta.url), 'utf8')
const policy = readFileSync(new URL('../../src/lib/question-quality/community-policy.ts', import.meta.url), 'utf8')

describe('213 community-quality@2 model gate SQL contract', () => {
  it('terminates both replaced PL/pgSQL bodies with valid PostgreSQL syntax', () => {
    const plpgsqlFunctions = migration.match(/LANGUAGE plpgsql[\s\S]*?AS \$fn\$[\s\S]*?\$fn\$;/g) ?? []
    expect(plpgsqlFunctions).toHaveLength(2)
    for (const functionBody of plpgsqlFunctions) expect(functionBody).toMatch(/END;\s*\$fn\$;$/)
  })

  it('requires every automatic threshold to hold with and without the model term', () => {
    expect(migration).toContain('IF LEAST(posterior,posterior_without_model)>=0.995')
    expect(migration).toContain("ELSIF LEAST(posterior,posterior_without_model)>=0.98 THEN computed_decision:='quarantine';")
    expect(migration).toContain('ELSIF clean_floor AND GREATEST(posterior,posterior_without_model)<=0.02 THEN')
    // The decided outcome never reads the model-inclusive posterior on its own.
    expect(migration).not.toMatch(/ELSIF posterior>=0\.98 THEN computed_decision/)
  })

  it('keeps the human floors and thresholds of community-quality@1', () => {
    expect(migration).toContain('flaw_floor:=independent_users>=5 AND independent_clusters>=5 AND leading_clusters>=3')
    expect(migration).toContain('AND trusted_flaw>=3 AND leading_fingerprint IS NOT NULL;')
    expect(migration).toContain('clean_floor:=independent_users>=5 AND independent_clusters>=5 AND trusted_clean>=3;')
    expect(migration).toContain("ELSIF posterior>=0.98 THEN ungated_decision:='quarantine';")
    expect(migration).toContain("IF posterior>=0.995 AND proof_kind<>'none' AND proof_direction='supports_flaw' THEN ungated_decision:='confirmed';")
  })

  it('withholds new actions but never reverses one already taken', () => {
    expect(migration).toContain("model_gate:='held_for_human_review';")
    expect(migration).toContain("IF quality_case.state='confirmed' AND ungated_decision='confirmed' THEN")
    expect(migration).toContain("ELSIF quality_case.state IN ('quarantined','confirmed')")
    expect(migration).toContain("model_gate:='retained_existing_action';")
  })

  it('records the applied rule in the hashed snapshot', () => {
    expect(migration).toContain("'policyVersion','community-quality@2','posteriorWithoutModel',posterior_without_model,")
    expect(migration).toContain("'ungatedDecision',ungated_decision,'modelGate',model_gate")
    const snapshotEnd = migration.indexOf("'ungatedDecision',ungated_decision,'modelGate',model_gate")
    const hashIndex = migration.indexOf("inputs_sha:=encode(extensions.digest(snapshot::text,'sha256'),'hex');")
    expect(snapshotEnd).toBeGreaterThan(-1)
    expect(hashIndex).toBeGreaterThan(snapshotEnd)
  })

  it('accepts the previous version during rollout but stores the version it applied', () => {
    expect(migration).toContain("effective_policy_version constant text:='community-quality@2';")
    expect(migration).toContain("OR p_policy_version NOT IN ('community-quality@1','community-quality@2') THEN")
    expect(migration).toContain('p_case_id,effective_policy_version,effective_decision,')
    expect(migration).toContain('policy_version=effective_policy_version AND inputs_sha256=')
    expect(migration).toContain("'Topluluk kalite kaniti: '||effective_policy_version||' / '||effective_decision")
    expect(migration.match(/jsonb_build_object\('caseId',p_case_id,'policyVersion',effective_policy_version\)\)/g)).toHaveLength(2)
    expect(migration).toContain("'policyVersion',effective_policy_version,'replayed',false);")
    // The request hash identifies the caller's request, so it keeps the caller's version.
    expect(migration).toContain("'caseId',p_case_id,'policyVersion',p_policy_version")
  })

  it('keeps the service-only ACLs', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.compute_question_quality_consensus(uuid)')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.record_question_quality_consensus(uuid,uuid,text,uuid)')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.record_question_quality_consensus(uuid,uuid,text,uuid)\n  TO service_role;')
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.compute_question_quality_consensus/)
  })

  it('makes the worker request the policy version from its single source of truth', () => {
    expect(policy).toContain("export const COMMUNITY_QUALITY_POLICY_VERSION = 'community-quality@2'")
    expect(runner).toContain("await vite.ssrLoadModule('/src/lib/question-quality/community-policy.ts')")
    expect(runner.match(/p_policy_version: policyVersion,/g)).toHaveLength(2)
    expect(runner).not.toContain("'community-quality@1'")
  })
})
