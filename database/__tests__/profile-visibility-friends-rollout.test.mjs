import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const deploy = readFileSync(new URL('../deploy-profile-visibility-friends.mjs', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../../.github/workflows/profile-visibility-friends-rollout.yml', import.meta.url), 'utf8')

describe('profile visibility and friends production rollout', () => {
  it('requires explicit confirmation and records both migrations', () => {
    expect(deploy).toContain('--confirm-production')
    expect(deploy).toContain("20260828010000")
    expect(deploy).toContain("20260828010001")
    expect(deploy).toContain('supabase_migrations.schema_migrations')
    expect(deploy).toContain('ON CONFLICT(version) DO NOTHING')
  })

  it('fails closed when migration 177 or relationship integrity is not verified', () => {
    expect(deploy).toContain('browserProfileReadClosed')
    expect(deploy).toContain('reverseDuplicatePairs')
    expect(deploy).toContain('Production prerequisite 177 is not verified')
    expect(deploy).toContain('Production contains reverse friendship duplicates')
  })

  it('keeps inspect as default and gates production apply', () => {
    expect(workflow).toContain('default: inspect')
    expect(workflow).toContain("inputs.confirmation != 'APPLY_PROFILE_FRIENDS'")
    expect(workflow).toContain('--apply --confirm-production')
    expect(workflow).toContain('environment: production')
  })
})
