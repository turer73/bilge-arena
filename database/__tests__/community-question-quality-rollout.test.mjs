import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const deploy = readFileSync(new URL('../deploy-community-question-quality.mjs', import.meta.url), 'utf8')
const roleMigration = readFileSync(new URL('../migrations/147_community_question_quality_worker_role.sql', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../../.github/workflows/community-question-quality-rollout.yml', import.meta.url), 'utf8')

describe('community quality production rollout', () => {
  it('requires an explicit production confirmation and records both migrations', () => {
    expect(deploy).toContain("--confirm-production")
    expect(deploy).toContain("20260824073000")
    expect(deploy).toContain("20260824073001")
    expect(deploy).toContain('supabase_migrations.schema_migrations')
    expect(deploy).toContain("ON CONFLICT(version) DO NOTHING")
    expect(deploy).toContain("Production verification failed")
    expect(deploy).toContain("'controlCandidates'")
    expect(deploy).toContain("(osym|meb)")
    expect(deploy).toContain("count(DISTINCT approval.stage)")
  })

  it('creates a least-privilege worker role', () => {
    expect(roleMigration).toContain("'question_quality_worker'")
    expect(roleMigration).toContain("'content.appeals.manage'")
    expect(roleMigration).toContain("'content.corrections.apply'")
    expect(roleMigration).not.toContain("'content.publish'")
    expect(roleMigration).not.toContain("'admin.users.manage'")
  })

  it('keeps inspect as the default and gates apply with an exact phrase', () => {
    expect(workflow).toContain('default: inspect')
    expect(workflow).toContain("inputs.confirmation != 'APPLY_COMMUNITY_QUALITY'")
    expect(workflow).toContain('--apply --confirm-production')
    expect(workflow).toContain('environment: production')
  })
})
