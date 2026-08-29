import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const deploy = readFileSync(new URL('../deploy-community-question-quality.mjs', import.meta.url), 'utf8')
const roleMigration = readFileSync(new URL('../migrations/147_community_question_quality_worker_role.sql', import.meta.url), 'utf8')
const controlMigration = readFileSync(new URL('../migrations/148_community_question_quality_control_seed.sql', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../../.github/workflows/community-question-quality-rollout.yml', import.meta.url), 'utf8')

describe('community quality production rollout', () => {
  it('requires an explicit production confirmation and records every migration', () => {
    expect(deploy).toContain("--confirm-production")
    expect(deploy).toContain("20260824073000")
    expect(deploy).toContain("20260824073001")
    expect(deploy).toContain("20260824083000")
    expect(deploy).toContain('supabase_migrations.schema_migrations')
    expect(deploy).toContain("ON CONFLICT(version) DO NOTHING")
    expect(deploy).toContain("Production verification failed")
    expect(deploy).toContain("'controlCandidates'")
    expect(deploy).toContain("(osym|meb)")
    expect(deploy).toContain("count(DISTINCT approval.stage)")
    expect(deploy).toContain("'seededDeterministic'")
  })

  it('creates a least-privilege worker role', () => {
    expect(roleMigration).toContain("'question_quality_worker'")
    expect(roleMigration).toContain("'content.appeals.manage'")
    expect(roleMigration).toContain("'content.corrections.apply'")
    expect(roleMigration).not.toContain("'content.publish'")
    expect(roleMigration).not.toContain("'admin.users.manage'")
  })

  it('seeds five isolated deterministic clean controls', () => {
    expect(controlMigration).toContain('community-quality-control-seed-v1')
    expect(controlMigration).toContain("question.is_active=false")
    expect(controlMigration).toContain('question.published_revision_id IS NULL')
    expect(controlMigration).toContain("revision.status='draft'")
    expect(controlMigration).toContain("control.expected_verdict='clean'")
    expect(controlMigration).toContain("control.proof_kind='deterministic'")
    expect(controlMigration).toContain('valid_seed_count<>5')
    expect(controlMigration).not.toContain("status='published'")
  })

  it('keeps inspect as the default and gates apply with an exact phrase', () => {
    expect(workflow).toContain('default: inspect')
    expect(workflow).toContain("inputs.confirmation != 'APPLY_COMMUNITY_QUALITY'")
    expect(workflow).toContain('--apply --confirm-production')
    expect(workflow).toContain('environment: production')
  })
})
