#!/usr/bin/env node
// Tam migration zincirini BOS bir PostgreSQL'e uretim sirasiyla uygular.
//
// NEDEN: felaket kurtarma, preview ya da yeni ortam ancak zincir sifirdan
// kurulabiliyorsa mumkun. Sira database/migration-order.json'dan gelir (dosya adi
// sirasi degil). Her dosya, uretim yayinlarindaki gibi psql ile ve ON_ERROR_STOP
// ile kosar; dosyalarin kendi BEGIN/COMMIT'leri ve CREATE INDEX CONCURRENTLY
// olduklari gibi calisir.
//
// Uretime uygulanmis son girdiden sonra (pending girdilerden once) public
// fonksiyonlarinin parmak izi alinir ve --expect-functions ile verilen uretim
// parmak iziyle karsilastirilir: zincir uretimle ayni fonksiyon govdesini,
// SECURITY DEFINER'i, search_path'i ve ACL'yi vermeli.
//
// Ortam:
//   MIGRATION_CHAIN_DATABASE_URL        hedef (bos, atilabilir) veritabani
//   MIGRATION_CHAIN_DATABASE_DISPOSABLE  1 olmali; hedef bos degilse yine reddedilir
//   PSQL                                 psql yolu (varsayilan: psql)
// Bayraklar:
//   --expect-functions <dosya>  uretim parmak izi (function-fingerprint.sql ciktisi)
//   --write-functions <dosya>   zincirin parmak izini yaz (uretime uygulanmis kisim)
//   --through <dosya>           bu dosyadan sonra dur (yerel ariza ayiklama)

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DATABASE_DIR, MIGRATIONS_DIR, loadMigrationOrder, validateMigrationOrder } from './migration-order.mjs'

export const FINGERPRINT_SQL_PATH = join(DATABASE_DIR, 'migration-chain', 'function-fingerprint.sql')
export const KNOWN_DRIFT_PATH = join(DATABASE_DIR, 'migration-chain', 'known-production-drift.json')

function fail(message) {
  console.error(`\nZINCIR DURDU: ${message}`)
  process.exit(1)
}

function psql(url, args, { input } = {}) {
  const result = spawnSync(process.env.PSQL || 'psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args, url], {
    encoding: 'utf8',
    input,
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning', PGAPPNAME: 'bilge-migration-chain' },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) fail(`psql calistirilamadi: ${result.error.message}`)
  return result
}

function query(url, sql) {
  const result = psql(url, ['-A', '-t', '-F', '|', '-f', '-'], { input: sql })
  if (result.status !== 0) fail(`sorgu basarisiz:\n${result.stderr}`)
  return result.stdout
}

export function parseFingerprint(text) {
  const rows = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('--')) continue
    const parts = line.split('|')
    if (parts.length < 5) continue
    const acl = parts.slice(4).join('|')
    rows.set(parts[0], { body: parts[1], secdef: parts[2], config: parts[3], acl })
  }
  return rows
}

// Uretim (expected) ile zincir (actual) farki. Donen: [{ signature, kind, production, chain }]
// production/chain: farkli alanin iki taraftaki degeri (eksik tarafta null).
export function diffFingerprints(expected, actual) {
  const diffs = []
  for (const [signature, want] of expected) {
    const got = actual.get(signature)
    if (!got) {
      diffs.push({ signature, kind: 'missing-in-chain', production: want.body, chain: null })
      continue
    }
    for (const key of ['body', 'secdef', 'config', 'acl']) {
      if (want[key] !== got[key]) diffs.push({ signature, kind: `${key}-differs`, production: want[key], chain: got[key] })
    }
  }
  for (const [signature, got] of actual) {
    if (!expected.has(signature)) diffs.push({ signature, kind: 'extra-in-chain', production: null, chain: got.body })
  }
  return diffs
}

export function loadKnownDrift(path = KNOWN_DRIFT_PATH) {
  return JSON.parse(readFileSync(path, 'utf8')).functions ?? []
}

// Bilinen sapmalari ayikla. Giris yalniz imza, tur ve iki taraftaki deger birebir
// tutarsa eslesir. Donen: { unexpected: [fark], stale: [giris] }
export function applyKnownDrift(diffs, known = loadKnownDrift()) {
  const used = new Set()
  const unexpected = diffs.filter((diff) => {
    const index = known.findIndex((entry) => entry.signature === diff.signature
      && entry.kind === diff.kind
      && (entry.production ?? null) === diff.production
      && (entry.chain ?? null) === diff.chain)
    if (index < 0) return true
    used.add(index)
    return false
  })
  return { unexpected, stale: known.filter((_, index) => !used.has(index)) }
}

export function formatDiff(diff) {
  return `${diff.signature}  [${diff.kind}]  uretim=${diff.production || '∅'} zincir=${diff.chain || '∅'}`
}

function assertDisposableEmptyTarget(url) {
  if (process.env.MIGRATION_CHAIN_DATABASE_DISPOSABLE !== '1') fail('MIGRATION_CHAIN_DATABASE_DISPOSABLE=1 gerekli')
  const out = query(url, `SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%';`)
  if (Number(out.trim()) !== 0) fail(`hedef veritabani bos degil (${out.trim()} iliski); zincir yalniz bos, atilabilir veritabanina kurulur`)
}

const failures = []

function applyFile(url, label, path, { keepGoing = false } = {}) {
  const started = Date.now()
  const result = psql(url, ['-f', path])
  const ms = Date.now() - started
  if (result.status !== 0) {
    console.error(`FAIL ${label} (${ms} ms)`)
    process.stderr.write(result.stderr)
    if (!keepGoing) fail(`${label} uygulanamadi`)
    failures.push(label)
    return
  }
  console.log(`ok   ${label} (${ms} ms)`)
}

function main() {
  const args = process.argv.slice(2)
  const option = (name) => {
    const at = args.indexOf(name)
    return at >= 0 ? args[at + 1] : undefined
  }
  const url = process.env.MIGRATION_CHAIN_DATABASE_URL
  if (!url) fail('MIGRATION_CHAIN_DATABASE_URL gerekli')
  const manifest = loadMigrationOrder()
  const violations = validateMigrationOrder(manifest)
  if (violations.length) {
    for (const v of violations) console.error(`  ${v.file ?? '-'}  [${v.rule}]  ${v.detail}`)
    fail('migration-order.json gecersiz (node database/migration-order.mjs)')
  }
  const expectPath = option('--expect-functions')
  const writePath = option('--write-functions')
  const through = option('--through')
  // --keep-going: ariza ayiklama icin; hata veren dosyayi atlayip devam eder (sonuc yine basarisiz).
  const keepGoing = args.includes('--keep-going')

  assertDisposableEmptyTarget(url)
  console.log(`server: ${query(url, 'SHOW server_version;').trim()}`)
  applyFile(url, `platform: ${manifest.platformStub}`, join(DATABASE_DIR, manifest.platformStub))
  applyFile(url, `baseline: ${manifest.baseline}`, join(DATABASE_DIR, manifest.baseline))

  const entries = manifest.migrations
  const lastProduction = entries.findLastIndex((entry) => entry.status !== 'pending')
  let diffCount = 0
  for (const [index, entry] of entries.entries()) {
    if (entry.operatorStep) applyFile(url, `    operator: ${entry.operatorStep}`, join(DATABASE_DIR, entry.operatorStep), { keepGoing })
    applyFile(url, `${String(index + 1).padStart(3, '0')} ${entry.file} [${entry.status}]`, join(MIGRATIONS_DIR, entry.file), { keepGoing })
    if (index === lastProduction && (expectPath || writePath)) {
      const fingerprint = query(url, readFileSync(FINGERPRINT_SQL_PATH, 'utf8'))
      if (writePath) writeFileSync(writePath, fingerprint)
      if (expectPath) {
        const diffs = diffFingerprints(parseFingerprint(readFileSync(expectPath, 'utf8')), parseFingerprint(fingerprint))
        const { unexpected, stale } = applyKnownDrift(diffs)
        diffCount = unexpected.length + stale.length
        console.log(`parmak izi (${entry.file} sonrasi): ${parseFingerprint(fingerprint).size} public fonksiyon, ${diffs.length - unexpected.length} bilinen sapma`)
        if (unexpected.length) {
          console.error(`\nURETIM PARMAK IZI FARKI: ${unexpected.length}`)
          for (const diff of unexpected) console.error(`  ${formatDiff(diff)}`)
          console.error('  Zincir uretimle ayni tanimi vermiyor: sira, eksik/fazla migration ya da uretimde elle yapilan degisiklik.')
          console.error('  Uretime yeni migration uyguladiysan parmak izini yenile (database/migration-chain/README.md).')
        }
        if (stale.length) {
          console.error(`\nBAYAT BILINEN SAPMA: ${stale.length} (known-production-drift.json artik eslesmiyor; girisi sil ya da guncelle)`)
          for (const entry of stale) console.error(`  ${entry.signature}  [${entry.kind}]`)
        }
      }
    }
    if (through && entry.file === through) {
      console.log(`--through ${through}: durduruldu`)
      return
    }
  }
  if (failures.length) fail(`${failures.length} dosya uygulanamadi:\n  ${failures.join('\n  ')}`)
  if (diffCount) fail(`zincir kuruldu ama uretim parmak iziyle ${diffCount} aciklanmamis fark var`)
  console.log(`\nOK: platform + baseline + ${entries.length} migration bos veritabanina uygulandi.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
