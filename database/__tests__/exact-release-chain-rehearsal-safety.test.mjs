import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RELEASE_CHAIN_FILES,
  ledgerContainsFile,
  loadReleaseChain,
  validateRehearsalTarget,
} from '../../scripts/security/rehearse-exact-release-chain.mjs'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const runnerSource = readFileSync(
  join(repositoryRoot, 'scripts', 'security', 'rehearse-exact-release-chain.mjs'),
  'utf8',
)

describe('exact 187-204 release-chain rehearsal safety', () => {
  it('loads every real migration exactly once and in ordinal order', () => {
    const plan = loadReleaseChain(join(repositoryRoot, 'database', 'migrations'))
    expect(plan.map(({ ordinal }) => ordinal)).toEqual(
      Array.from({ length: 18 }, (_, index) => 187 + index),
    )
    expect(plan.map(({ fileName }) => fileName)).toEqual(RELEASE_CHAIN_FILES)
    expect(plan.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true)
  })

  it('requires explicit disposable opt-in, a local host, and the exact database prefix', () => {
    expect(() => validateRehearsalTarget({
      BILGE_EXACT_CHAIN_TEST_DATABASE_URL: 'postgres://postgres@localhost/postgres',
      BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE: '1',
    })).toThrow('database name must match bilge_exact_chain_test_*')
    expect(() => validateRehearsalTarget({
      BILGE_EXACT_CHAIN_TEST_DATABASE_URL: 'postgres://postgres@db.example.com/bilge_exact_chain_test_prod',
      BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE: '1',
    })).toThrow('refusing a non-local')
    expect(() => validateRehearsalTarget({
      BILGE_EXACT_CHAIN_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1/bilge_exact_chain_test_acceptance',
    })).toThrow('DISPOSABLE=1')
    expect(validateRehearsalTarget({
      BILGE_EXACT_CHAIN_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1/bilge_exact_chain_test_acceptance',
      BILGE_EXACT_CHAIN_TEST_DATABASE_DISPOSABLE: '1',
    }).databaseName).toBe('bilge_exact_chain_test_acceptance')
  })

  it('recognises ordinal and timestamp-ledger migration names without mutating the ledger', () => {
    expect(ledgerContainsFile([
      { version: '186_atomic_friend_requests', name: null },
    ], '186_atomic_friend_requests.sql')).toBe(true)
    expect(ledgerContainsFile([
      { version: '20260829120000', name: 'release_ydt_english_mastery_scope' },
    ], '187_release_ydt_english_mastery_scope.sql')).toBe(true)
    expect(runnerSource).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+supabase_migrations\.schema_migrations/i,
    )
  })

  it('checks Social after both 191 and 192 and fails closed on the first SQL error', () => {
    expect(runnerSource).toMatch(
      /migration\.ordinal === 191 \|\| migration\.ordinal === 192[\s\S]*assertSocialScopeClosed/,
    )
    expect(runnerSource).not.toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]{0,200}\bcontinue\b/)
    expect(runnerSource).toContain('embeddedPostcheckPassed: true')
  })
})
