import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/212_question_quality_model_free_posterior.sql', import.meta.url), 'utf8')
const consensus = readFileSync(new URL('../migrations/146_community_question_quality_consensus.sql', import.meta.url), 'utf8')

describe('212 model-free posterior SQL contract', () => {
  it('terminates the replaced PL/pgSQL body with valid PostgreSQL syntax', () => {
    const plpgsqlFunctions = migration.match(/LANGUAGE plpgsql[\s\S]*?AS \$fn\$[\s\S]*?\$fn\$;/g) ?? []
    expect(plpgsqlFunctions).toHaveLength(1)
    expect(plpgsqlFunctions[0]).toMatch(/END;\s*\$fn\$;$/)
  })

  it('derives the model-free posterior from the human and proof terms only', () => {
    expect(migration).toContain('posterior_without_model numeric;')
    expect(migration).toContain('posterior_without_model:=round(1/(1+exp(-(ln(0.02/0.98)+human_llr+proof_llr))),9);')
    // The model term must not leak into the model-free value.
    expect(migration).not.toMatch(/posterior_without_model:=[^\n]*model_llr/)
  })

  it('keeps the decided posterior and every threshold unchanged', () => {
    expect(migration).toContain('posterior:=1/(1+exp(-(ln(0.02/0.98)+human_llr+model_llr+proof_llr)));')
    expect(migration).toContain("ELSIF posterior>=0.98 THEN computed_decision:='quarantine';")
    expect(migration).toContain("IF posterior>=0.995 AND proof_kind<>'none' AND proof_direction='supports_flaw' THEN computed_decision:='confirmed';")
    expect(migration).toContain('IF independent_users>=5 AND independent_clusters>=5 AND leading_clusters>=3')
    // No branch may read the new value: this migration records, it never decides.
    expect(migration).not.toMatch(/(IF|ELSIF)[^\n]*posterior_without_model/)
  })

  it('hashes the pre-existing snapshot so the decision dedup key is unchanged', () => {
    expect(migration).toContain("inputs_sha:=encode(extensions.digest(snapshot::text,'sha256'),'hex');")
    // The derived field is appended after hashing, never folded into the hash.
    const hashIndex = migration.indexOf("inputs_sha:=encode(")
    const fieldIndex = migration.indexOf("'posteriorWithoutModel',posterior_without_model")
    expect(hashIndex).toBeGreaterThan(-1)
    expect(fieldIndex).toBeGreaterThan(hashIndex)
    expect(migration).toContain("'posteriorWithoutModel',posterior_without_model,\n'inputsSha256',inputs_sha);")
    expect(consensus).toContain('UNIQUE(case_id,policy_version,inputs_sha256)')
  })

  it('keeps the consensus helper internal to the governance authority', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.compute_question_quality_consensus(uuid)')
    expect(migration).toContain('FROM PUBLIC,anon,authenticated,service_role;')
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.compute_question_quality_consensus/)
  })
})
