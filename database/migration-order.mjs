#!/usr/bin/env node
// Migration sira manifesti (database/migration-order.json) okuyucu ve denetcisi.
//
// NEDEN: dosya adi sirasi uygulama sirasi degildir. Zaman damgali dosyalar
// (20261008..., 20261017...) sozluk sirasinda 201 ile 202 arasina duser; uretimde
// ise 222'den sonra uygulandilar. Sozluk sirasiyla sifirdan kurulan bir ortamda
// 10 fonksiyonun son tanimi eski surume doner (derin inceleme 2026-10-15 §4.5).
// Manifest, uretim defterinden (supabase_migrations.schema_migrations) alinan
// gercek sirayi tutar; tam zincir CI isi (apply-migration-chain.mjs) bunu uygular.
//
// Kurallar (validateMigrationOrder):
//   - migrations/ altindaki her .sql manifestte tam bir kez, manifestteki her dosya diskte
//   - status gecerli; ledger/ledger-backfill defter satiri tasir, digerleri tasimaz
//   - defter versiyonlari benzersiz; status=ledger girdilerinde kesin artan
//   - pre-ledger girdileri en basta, pending girdileri en sonda
//   - ledger-backfill sirasinin gerekcesi note'ta yazili
//   - yeni dosya sozluk sirasinda kendinden onceki her dosyadan SONRA gelir
//     (tarihsel istisnalar LEXICAL_ORDER_EXCEPTIONS'ta sabit). Boylece dosya adina
//     gore siralayan her arac yeni dosyalari da dogru yerde calistirir.
//
// CLI: node database/migration-order.mjs                 -> manifesti denetle
//      node database/migration-order.mjs --ledger <dump>  -> manifesti uretim defteri dokumuyle karsilastir
//      (dokum: psql -X -A -F '|' -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version")

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATABASE_DIR = __dirname
export const MIGRATIONS_DIR = join(__dirname, 'migrations')
export const MIGRATION_ORDER_PATH = join(__dirname, 'migration-order.json')
export const ORDER_STATUSES = ['pre-ledger', 'ledger', 'ledger-backfill', 'unrecorded', 'pending']

// Uretim sirasi sozluk sirasindan sapan tarihsel dosyalar (2026-10-17 itibariyla).
// Buraya yeni dosya eklemek, sozluge gore siralayan araclarin onu yanlis yerde
// calistirmasini kabul etmek demektir; yeni migration'a bunun yerine sozlukte
// sonra gelen bir ad ver.
export const LEXICAL_ORDER_EXCEPTIONS = Object.freeze([
  '003_add_error_reports.sql',
  '016b_fix_rls_recursion.sql',
  '130_purchase_ledger.sql',
  '158_invitation_only_free_institution_pilot.sql',
  '159_free_pilot_expiry_rpc_closure.sql',
  '160_free_pilot_replay_and_student_surface_closure.sql',
  '181_curriculum_scope_repair_and_parent_integrity.sql',
  '182_institution_math_scope_registry_alignment.sql',
  '183_institution_taxonomy_consumer_alignment.sql',
  '184_adaptive_diagnostic_registry_write_gate.sql',
  '212_question_quality_model_free_posterior.sql',
  '213_question_quality_model_gate.sql',
  '214_question_quality_model_gate_retention.sql',
  '216_social_discovery_pilot.sql',
  '20261008183619_question_source_curriculum_v2.sql',
  '20261008200746_question_source_ai_owner_acceptance.sql',
  '20261009063101_question_content_exam_option_guard.sql',
  '20261009183145_tyt_social_reviewed_preparation_pool.sql',
  '20261009200126_institution_basic_pilot_onboarding.sql',
  '20261009200000_question_source_evidence_exceptions.sql',
  '20261010045907_governed_social_outcome_projection.sql',
  '20261010050615_tyt_social_preparation_learner_flow.sql',
  '20261011062902_controlled_measurement.sql',
  '20261011124426_governed_math_outcome_projection.sql',
  '20261011203500_revision_bound_fen_quality_policy.sql',
  '20261016190000_challenge_submit_integrity.sql',
  '20261017090000_admin_read_aal2_privacy_boundaries.sql',
  '20261017090100_institution_teacher_add_uniform_refusal.sql',
  '20261017100000_session_xp_daily_cap.sql',
  '20261017100100_single_streak_writer.sql',
  '20261017100200_coach_transfer_excludes_attempt_questions.sql',
  '20261017110000_revealed_question_xp_window.sql',
  '20261013183312_adaptive_diagnostic_legacy_coverage_repair.sql',
  '20261013184551_tyt_social_learning_epoch_forward.sql',
  '20261014183929_revision_bound_turkce_quality_policy.sql',
])

export function loadMigrationOrder(path = MIGRATION_ORDER_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function migrationFileNames(dir = MIGRATIONS_DIR) {
  return readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
}

// Sozluk karsilastirmasi: Array.prototype.sort ve readdir().sort() ile ayni (UTF-16 kod birimi).
const lexicalAfter = (a, b) => a > b

// Manifesti denetle. Donen: [{ rule, file, detail }]
export function validateMigrationOrder(
  manifest = loadMigrationOrder(),
  files = migrationFileNames(),
  { lexicalExceptions = LEXICAL_ORDER_EXCEPTIONS } = {},
) {
  const violations = []
  const add = (rule, file, detail) => violations.push({ rule, file, detail })
  const entries = Array.isArray(manifest?.migrations) ? manifest.migrations : []
  if (!entries.length) add('order-empty', null, 'migration-order.json has no migrations[]')

  const onDisk = new Set(files)
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.file)) add('order-duplicate-file', entry.file, 'listed more than once')
    seen.add(entry.file)
    if (!onDisk.has(entry.file)) add('order-unknown-file', entry.file, 'listed in migration-order.json but missing from database/migrations')
  }
  for (const file of files) {
    if (!seen.has(file)) {
      add('order-missing-file', file, 'not listed in database/migration-order.json; append it as { "file": ..., "status": "pending" }')
    }
  }

  const versions = new Set()
  let lastLedgerVersion = null
  let lastLedgerFile = null
  let leftPreLedger = false
  let pendingFrom = null
  let lexicalMax = null
  let lexicalMaxFile = null
  const exceptions = new Set(lexicalExceptions)

  for (const entry of entries) {
    const { file, status } = entry
    if (!ORDER_STATUSES.includes(status)) {
      add('order-bad-status', file, `status must be one of ${ORDER_STATUSES.join(', ')}`)
    }
    const needsLedger = status === 'ledger' || status === 'ledger-backfill'
    const ledger = entry.ledger
    if (needsLedger && (!Array.isArray(ledger) || !ledger.length)) {
      add('order-ledger-shape', file, `status ${status} needs ledger: [{ version, name }]`)
    } else if (!needsLedger && ledger !== undefined) {
      add('order-ledger-shape', file, `status ${status} must not carry ledger rows`)
    }
    for (const row of Array.isArray(ledger) ? ledger : []) {
      if (!/^\d{14}$/.test(row?.version ?? '') || typeof row?.name !== 'string' || !row.name) {
        add('order-ledger-shape', file, 'ledger rows need a 14-digit version and a name')
        continue
      }
      if (versions.has(row.version)) add('order-duplicate-ledger-version', file, `ledger version ${row.version} is listed twice`)
      versions.add(row.version)
    }
    if (status === 'ledger' && Array.isArray(ledger)) {
      for (const row of ledger) {
        if (lastLedgerVersion !== null && !(row.version > lastLedgerVersion)) {
          add('order-ledger-not-monotonic', file, `ledger version ${row.version} is not after ${lastLedgerVersion} (${lastLedgerFile}); production applied it earlier`)
        }
        lastLedgerVersion = row.version
        lastLedgerFile = file
      }
    }
    if (entry.operatorStep !== undefined) {
      const step = entry.operatorStep
      if (typeof step !== 'string' || !/^migration-chain\/operator\/[\w.-]+\.sql$/.test(step) || !existsSync(join(DATABASE_DIR, step))) {
        add('order-operator-step', file, 'operatorStep must name an existing database/migration-chain/operator/*.sql file')
      }
    }
    if (status === 'ledger-backfill' && !(typeof entry.note === 'string' && entry.note.trim())) {
      add('order-backfill-note', file, 'ledger-backfill entries must explain their position in note')
    }
    if (status === 'pre-ledger' && leftPreLedger) {
      add('order-pre-ledger-position', file, 'pre-ledger entries must precede every ledger-era entry')
    }
    if (status !== 'pre-ledger') leftPreLedger = true
    if (status === 'pending') pendingFrom ??= file
    else if (pendingFrom) add('order-pending-not-tail', file, `${status} entry after pending ${pendingFrom}; pending migrations stay at the end`)

    if (lexicalMax !== null && !lexicalAfter(file, lexicalMax) && !exceptions.has(file)) {
      add('order-lexical-position', file, `sorts before ${lexicalMaxFile} but runs after it; name it so it sorts after every earlier migration (e.g. 223_<topic>.sql) — timestamps sort before 202_`)
    }
    if (lexicalMax === null || lexicalAfter(file, lexicalMax)) {
      lexicalMax = file
      lexicalMaxFile = file
    }
  }
  return violations
}

// Uretim defteri dokumunu (version|name satirlari) oku.
export function parseLedgerDump(text) {
  return text
    .split(/\r?\n/)
    .map((line) => /^(\d{14})\|([^|]+)/.exec(line.trim()))
    .filter(Boolean)
    .map(([, version, name]) => ({ version, name: name.trim() }))
}

// Manifesti uretim defteriyle karsilastir. Donen: [{ rule, detail }]
export function compareWithLedger(manifest, ledgerRows) {
  const problems = []
  const referenced = new Map()
  for (const entry of manifest.migrations ?? []) {
    for (const row of entry.ledger ?? []) referenced.set(row.version, { ...row, file: entry.file })
  }
  const live = new Map(ledgerRows.map((row) => [row.version, row]))
  for (const row of ledgerRows) {
    const ref = referenced.get(row.version)
    if (!ref) {
      const stem = row.name.replace(/^\d+_/, '')
      const pending = (manifest.migrations ?? []).find((entry) => entry.status === 'pending' && entry.file.replace(/\.sql$/, '').replace(/^\d+_/, '') === stem)
      problems.push({
        rule: 'ledger-row-not-in-manifest',
        detail: pending
          ? `${row.version} ${row.name} is live; mark ${pending.file} as status "ledger" with this row`
          : `${row.version} ${row.name} is live but no manifest entry references it`,
      })
    } else if (ref.name !== row.name) {
      problems.push({ rule: 'ledger-name-mismatch', detail: `${row.version}: manifest says ${ref.name}, ledger says ${row.name}` })
    }
  }
  for (const [version, ref] of referenced) {
    if (!live.has(version)) problems.push({ rule: 'manifest-row-not-in-ledger', detail: `${ref.file} references ${version} ${ref.name}, which the ledger does not have` })
  }
  return problems
}

function main() {
  const args = process.argv.slice(2)
  const manifest = loadMigrationOrder()
  const violations = validateMigrationOrder(manifest)
  for (const v of violations) console.error(`  ${v.file ?? '-'}  [${v.rule}]  ${v.detail}`)
  const ledgerAt = args.indexOf('--ledger')
  let problems = []
  if (ledgerAt >= 0) {
    const path = args[ledgerAt + 1]
    if (!path) throw new Error('--ledger needs a dump file')
    problems = compareWithLedger(manifest, parseLedgerDump(readFileSync(path, 'utf8')))
    for (const p of problems) console.error(`  [${p.rule}]  ${p.detail}`)
  }
  if (violations.length || problems.length) {
    console.error(`\nMIGRATION SIRASI: ${violations.length} manifest ihlali, ${problems.length} defter farki`)
    process.exitCode = 1
    return
  }
  console.log(`OK: ${manifest.migrations.length} migration manifestte, sira kurallari${ledgerAt >= 0 ? ' ve uretim defteri' : ''} tutarli.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
