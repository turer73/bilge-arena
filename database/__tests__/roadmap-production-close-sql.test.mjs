import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

describe('roadmap production close', () => {
  it('assembles exactly migrations 091 through 107 into one transaction', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/roadmap-production-close.mjs', 'assemble'],
      { cwd: root, encoding: 'utf8' }
    )

    expect(result.status, result.stderr).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output).toMatchObject({
      mode: 'assemble',
      migrationCount: 17,
      firstMigration: '091_verified_attempts.sql',
      lastMigration: '107_tyt_exam_scope_integrity.sql',
      invariantStatus: 'ok',
    })
    expect(output.bytes).toBeGreaterThan(390_000)
    expect(output.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('requires the exact project, branch, commit and confirmation', () => {
    const script = read('scripts/roadmap-production-close.mjs')

    expect(script).toContain('APPLY-091-107-lvnmzdowhfzmpkueurih')
    expect(script).toContain("MIGRATION_HISTORY_NAME = 'roadmap_close_091_107'")
    expect(script).toContain("PROJECT_REF !== 'lvnmzdowhfzmpkueurih'")
    expect(script).toContain("project.status !== 'ACTIVE_HEALTHY'")
    expect(script).toContain("GITHUB_REF !== 'refs/heads/master'")
    expect(script).toContain('APPROVED_SOURCE_SHA !== GITHUB_SHA')
    expect(script).toContain('await applyRecordedMigration(assembly.sql)')
    expect(script.match(/applyRecordedMigration\(assembly\.sql\)/g)).toHaveLength(1)
    expect(script).toContain("'/database/migrations'")
    expect(script).toContain('migration history response must be a top-level array')
    expect(script).toContain("typeof entry.version !== 'string'")
    expect(script).toContain("typeof entry.name !== 'string'")
    expect(script).toContain('canonical migration history was not recorded')
    expect(script).not.toMatch(/retry|setTimeout/)
  })

  it('fails closed around the approved 22-row repair and postconditions', () => {
    const prelude = read('scripts/roadmap-production-close-prelude.sql')
    const postlude = read('scripts/roadmap-production-close-postlude.sql')
    const state = read('scripts/roadmap-production-close-state.sql')

    expect(prelude).toContain('LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE')
    expect(prelude).toContain('v_invalid <> 22 OR v_candidates <> 22')
    expect(prelude).toContain('v_repaired <> 22')
    expect(prelude).toMatch(/'question', q\.content->>'sentence'[\s\S]*'answer', \(q\.content->>'correct'\)::integer/)
    expect(postlude).toContain('v_present <> 17')
    expect(postlude).toContain('v_invalid <> 0 OR v_candidates <> 0')
    expect(postlude).toContain('v_constraint_validated IS DISTINCT FROM true')
    expect(state).toContain("jsonb_object_agg(migration, present ORDER BY migration)")
  })

  it('exposes apply only as an explicit non-cancellable manual operation', () => {
    const workflow = read('.github/workflows/database-type-drift.yml')

    expect(workflow).toContain('roadmap_operation:')
    expect(workflow).toContain('- pg-acceptance')
    expect(workflow).toContain('- apply-091-107')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain('environment: Production')
    expect(workflow).toContain("github.ref == 'refs/heads/master'")
    expect(workflow).toContain('node scripts/roadmap-production-close.mjs assemble')
    expect(workflow).toContain('node scripts/roadmap-production-close.mjs apply')
    expect(workflow).toContain('Roadmap PostgreSQL 17 acceptance')
    expect(workflow).toContain('needs: roadmap-postgres-acceptance')
    expect(workflow).toContain('Compare production schema after roadmap close')
  })
})
