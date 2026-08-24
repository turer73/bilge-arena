import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../migrations/146_community_question_quality_consensus.sql', import.meta.url), 'utf8')
const route = readFileSync(new URL('../../src/app/api/questions/quality-missions/route.ts', import.meta.url), 'utf8')
const workerWorkflow = readFileSync(new URL('../../.github/workflows/community-question-quality.yml', import.meta.url), 'utf8')
const workerRunner = readFileSync(new URL('../run-community-question-quality.mjs', import.meta.url), 'utf8')
const pgAcceptance = readFileSync(new URL('./question-content-governance-postgres.integration.test.mjs', import.meta.url), 'utf8')

describe('community question-quality SQL contract', () => {
  it('terminates every PL/pgSQL function body with valid PostgreSQL syntax', () => {
    const plpgsqlFunctions = migration.match(/LANGUAGE plpgsql[\s\S]*?AS \$fn\$[\s\S]*?\$fn\$;/g) ?? []
    expect(plpgsqlFunctions).toHaveLength(13)
    for (const functionBody of plpgsqlFunctions) {
      expect(functionBody).toMatch(/END;\s*\$fn\$;$/)
    }
    expect(migration).not.toMatch(/IS DISTINCT FROM CASE\b/)
  })

  it('requires a server-side immutable answer lock before claim submission', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.lock_question_quality_mission_answer(')
    expect(migration).toContain("operation='quality_mission_answer_lock'")
    expect(migration).toContain('mission.locked_answer_index<>p_selected_answer_index')
    expect(migration).toContain('mission.locked_answer_index,p_verdict')
    expect(migration).toContain('trg_question_quality_mission_immutable')
    expect(migration).toContain('trg_question_quality_claim_append_only')
    expect(route).toContain("contentRpc(auth.admin, 'lock_question_quality_mission_answer'")
  })

  it('keeps hidden controls, answers, peer claims, and model evidence out of learner responses', () => {
    expect(migration).toContain("revision.content-ARRAY['answer','correct','solution','explanation']")
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.question_quality_cases,[\s\S]*public\.question_quality_consensus_queue FROM PUBLIC,anon,authenticated,service_role/)
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.question_quality_(missions|claims|controls|verifications)/)
  })

  it('uses database-derived consensus, human floors, cluster independence, and capped idempotent rewards', () => {
    expect(migration).toContain('snapshot:=public.compute_question_quality_consensus(p_case_id)')
    expect(migration).toContain('independent_users>=5 AND independent_clusters>=5')
    expect(migration).toContain('trusted_flaw>=3')
    expect(migration).toContain('leading_clusters>=3')
    expect(migration).toContain('daily_reward+reward_amount<=300')
    expect(migration).toContain("'question-quality-reward:'||matching_claim.user_id::text")
    expect(migration).toContain('ON CONFLICT(source_type,source_id,reward_type,reward_key) DO NOTHING')
  })

  it('queues consensus after every human claim and keeps research auxiliary', () => {
    expect(migration).toContain('INSERT INTO public.question_quality_consensus_queue(case_id)')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_question_quality_consensus_job')
    expect(workerRunner).toContain("rpc('claim_question_quality_consensus_job'")
    expect(migration).toContain("role IN ('model_a','model_b','research') AND status='ok'")
    expect(migration).not.toContain("SELECT 'official_source',v.direction INTO proof_kind,proof_direction")
  })

  it('keeps the model worker disabled until explicit variables and secrets exist', () => {
    expect(workerWorkflow).toContain("if: vars.COMMUNITY_QUALITY_WORKER_ENABLED == 'true'")
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY','QUESTION_QUALITY_WORKER_ACTOR_ID','GEMINI_API_KEY','DEEPSEEK_API_KEY']) {
      expect(workerWorkflow).toContain(`secrets.${name}`)
    }
  })

  it('runs migration 146 inside the disposable PostgreSQL acceptance suite', () => {
    expect(pgAcceptance).toContain("'146_community_question_quality_consensus.sql'")
    expect(pgAcceptance).toContain('lock_question_quality_mission_answer')
    expect(pgAcceptance).toContain("decision:'quarantine'")
  })
})
