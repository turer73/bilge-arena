#!/usr/bin/env node
// Migration idempotency linter.
//
// NEDEN: database/migrations/*.sql dosyalari prod'a SIRALI uygulanir. Biri
// re-run'da (supabase db reset / preview-branch / yeni ortam / felaket kurtarma)
// patlarsa, ardindan gelen TUM migration'lar bloke olur ve Supabase'de geri-alma
// (down) SQL yoktur. Bu yuzden her migration idempotent (tekrar-calistirilabilir)
// olmali. Bu linter, re-run'da hata verecek korumasiz DDL'i yakalar.
//
// Kurallar (hepsi PostgreSQL):
//   - CREATE TABLE            -> IF NOT EXISTS sart
//   - CREATE [UNIQUE] INDEX   -> IF NOT EXISTS sart
//   - CREATE TYPE             -> PG'de IF NOT EXISTS yok; DO/EXCEPTION duplicate_object
//                                blogu icine alinmali (blok icindekiler taranmaz)
//   - CREATE POLICY "x"       -> ayni dosyada onceden DROP POLICY IF EXISTS "x"
//   - CREATE TRIGGER x        -> DROP TRIGGER IF EXISTS x (veya CREATE OR REPLACE TRIGGER)
//   - CREATE SEQUENCE         -> IF NOT EXISTS sart
//
// Yorum (-- ve /* */), string literal ('...') ve dollar-quoted blok ($$...$$,
// $tag$...$tag$ — fonksiyon govdesi ve DO blogu) tarama disi birakilir; satir
// numaralari korunur. Eski (grandfathered) ihlaller baseline JSON'da tutulur.
// Migration sira numaralari da benzersiz olmali. Tarihsel 017 cakismasi prod
// gecmisini yeniden yazmamak icin dosya adlariyla sabitlenmistir; yeni bir
// cakisma CI'i durdurur.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(__dirname, 'migrations');
export const BASELINE_PATH = join(__dirname, 'migration-idempotency-baseline.json');
export const GRANDFATHERED_DUPLICATE_ORDINALS = {
  '017': ['017_homepage_editor.sql', '017_question_text_search_index.sql'],
};

function migrationFiles(dir = MIGRATIONS_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

// Ayni sayisal on eke sahip migration dosyalarini dondur: { ordinal -> files }.
export function duplicateMigrationOrdinals(files = migrationFiles()) {
  const grouped = {};
  for (const file of files) {
    const match = /^(\d+)_/.exec(file);
    if (!match) continue;
    (grouped[match[1]] ??= []).push(file);
  }
  return Object.fromEntries(
    Object.entries(grouped)
      .filter(([, names]) => names.length > 1)
      .map(([ordinal, names]) => [ordinal, names.sort()]),
  );
}

// Sadece birebir kayitli tarihsel cakismalari kabul et. Ayni ordinal'e ucuncu
// dosya eklemek de dahil her fark yeni bir ihlaldir.
export function unexpectedDuplicateMigrationOrdinals(
  duplicates = duplicateMigrationOrdinals(),
  grandfathered = GRANDFATHERED_DUPLICATE_ORDINALS,
) {
  const unexpected = {};
  for (const [ordinal, files] of Object.entries(duplicates)) {
    const allowed = grandfathered[ordinal];
    if (!allowed || files.join('\0') !== [...allowed].sort().join('\0')) {
      unexpected[ordinal] = files;
    }
  }
  return unexpected;
}

// Stripped bolgeleri ayni sayida bosluk/newline ile degistir -> satir no korunur.
function blank(match) {
  return match.replace(/[^\n]/g, ' ');
}

// SQL'i tara: yorum + string + dollar-quoted bloklari noktala (newline'lari koru).
export function stripNoise(sql) {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, blank); // /* blok yorum */
  s = s.replace(/--[^\n]*/g, blank);               // -- satir yorumu
  s = s.replace(/'(?:[^']|'')*'/g, blank);          // 'string' ('' kacisi dahil)
  s = s.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, blank); // $$...$$ / $tag$...$tag$
  return s;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

function normName(raw) {
  return raw.replace(/"/g, '').replace(/^[\w]+\./, '').toLowerCase();
}

// Tek bir migration'in icerigini tara, ihlal listesi dondur.
// Donen: [{ rule, detail, line }]
export function lintSql(sql) {
  const s = stripNoise(sql);
  const violations = [];
  const add = (rule, detail, index) => violations.push({ rule, detail, line: lineOf(s, index) });

  // 1) CREATE TABLE (IF NOT EXISTS yok)
  for (const m of s.matchAll(/\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)/gi)) {
    add('create-table-no-ine', 'CREATE TABLE without IF NOT EXISTS', m.index);
  }
  // 2) CREATE [UNIQUE] INDEX [CONCURRENTLY] (IF NOT EXISTS yok)
  for (const m of s.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?!IF\s+NOT\s+EXISTS\b)/gi)) {
    add('create-index-no-ine', 'CREATE INDEX without IF NOT EXISTS', m.index);
  }
  // 3) CREATE TYPE (DO/EXCEPTION blogu strip edildigi icin burada gorulen = korumasiz)
  for (const m of s.matchAll(/\bCREATE\s+TYPE\b/gi)) {
    add('create-type-unguarded', 'CREATE TYPE without DO/EXCEPTION duplicate_object guard', m.index);
  }
  // 4) CREATE SEQUENCE (IF NOT EXISTS yok)
  for (const m of s.matchAll(/\bCREATE\s+SEQUENCE\s+(?!IF\s+NOT\s+EXISTS\b)/gi)) {
    add('create-sequence-no-ine', 'CREATE SEQUENCE without IF NOT EXISTS', m.index);
  }
  // 5) CREATE POLICY "x" -> onceden DROP POLICY IF EXISTS "x" olmali
  const droppedPolicies = new Set();
  for (const m of s.matchAll(/\bDROP\s+POLICY\s+IF\s+EXISTS\s+("[^"]+"|[\w.]+)/gi)) {
    droppedPolicies.add(normName(m[1]));
  }
  for (const m of s.matchAll(/\bCREATE\s+POLICY\s+("[^"]+"|[\w.]+)/gi)) {
    if (!droppedPolicies.has(normName(m[1]))) {
      add('create-policy-no-drop', `CREATE POLICY ${m[1]} without prior DROP POLICY IF EXISTS`, m.index);
    }
  }
  // 6) CREATE TRIGGER x -> DROP TRIGGER IF EXISTS x veya CREATE OR REPLACE TRIGGER
  const droppedTriggers = new Set();
  for (const m of s.matchAll(/\bDROP\s+TRIGGER\s+IF\s+EXISTS\s+([\w."]+)/gi)) {
    droppedTriggers.add(normName(m[1]));
  }
  for (const m of s.matchAll(/\bCREATE\s+(OR\s+REPLACE\s+)?TRIGGER\s+([\w."]+)/gi)) {
    if (m[1]) continue; // CREATE OR REPLACE TRIGGER zaten idempotent
    if (!droppedTriggers.has(normName(m[2]))) {
      add('create-trigger-no-drop', `CREATE TRIGGER ${m[2]} without DROP TRIGGER IF EXISTS / OR REPLACE`, m.index);
    }
  }
  return violations;
}

// Tum migration dosyalarini tara. Donen: { file -> [violation] } (sadece ihlalliler).
export function lintAll(dir = MIGRATIONS_DIR) {
  const files = migrationFiles(dir);
  const out = {};
  for (const f of files) {
    const v = lintSql(readFileSync(join(dir, f), 'utf8'));
    if (v.length) out[f] = v;
  }
  return out;
}

export function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).grandfathered ?? {};
  } catch {
    return {};
  }
}

// Baseline'da olmayan (yeni) ihlalleri dondur: { file -> [violation] }.
// Baseline her dosya icin izinli rule-sayilarini tutar; o sayinin uzeri yeni ihlaldir.
export function newViolations(all = lintAll(), baseline = loadBaseline()) {
  const fresh = {};
  for (const [file, vios] of Object.entries(all)) {
    const allowed = baseline[file] ?? {};
    const counts = {};
    const extras = [];
    for (const v of vios) {
      counts[v.rule] = (counts[v.rule] ?? 0) + 1;
      if (counts[v.rule] > (allowed[v.rule] ?? 0)) extras.push(v);
    }
    if (extras.length) fresh[file] = extras;
  }
  return fresh;
}

// CLI: `node database/lint-migrations.mjs`        -> baseline-disi ihlalde exit 1
//      `node database/lint-migrations.mjs --all`  -> baseline'i yoksay, tum ihlaller
//      `node database/lint-migrations.mjs --write-baseline` -> mevcut ihlalleri baseline yap
function main() {
  const args = process.argv.slice(2);
  const all = lintAll();
  const files = migrationFiles();
  const totalFiles = files.length;

  if (args.includes('--write-baseline')) {
    const grandfathered = {};
    for (const [file, vios] of Object.entries(all)) {
      grandfathered[file] = {};
      for (const v of vios) grandfathered[file][v.rule] = (grandfathered[file][v.rule] ?? 0) + 1;
    }
    const body = {
      _comment: 'Otomatik uretildi: lint-migrations.mjs --write-baseline. Eski (grandfathered) idempotency ihlalleri. YENI migration eklerken bunu BUYUTME; yeni dosyalar idempotent olmali.',
      grandfathered,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(body, null, 2) + '\n', 'utf8');
    process.stderr.write(`baseline yazildi: ${BASELINE_PATH}\n${Object.keys(grandfathered).length} dosya grandfathered.\n`);
    return;
  }

  const showAll = args.includes('--all');
  const result = showAll ? all : newViolations(all);
  const allDuplicateOrdinals = duplicateMigrationOrdinals(files);
  const duplicateOrdinals = showAll
    ? allDuplicateOrdinals
    : unexpectedDuplicateMigrationOrdinals(allDuplicateOrdinals);
  const fileCount = Object.keys(result).length;
  const vioCount = Object.values(result).reduce((n, a) => n + a.length, 0);
  const duplicateCount = Object.keys(duplicateOrdinals).length;

  if (!fileCount && !duplicateCount) {
    console.log(`OK: ${totalFiles} migration tarandi, ${showAll ? '' : 'baseline-disi '}idempotency veya sira numarasi ihlali yok.`);
    return;
  }
  if (fileCount) {
    console.error(`\nMIGRATION IDEMPOTENCY ${showAll ? '(tum ihlaller)' : 'IHLALI (baseline-disi)'}: ${vioCount} ihlal / ${fileCount} dosya\n`);
    for (const [file, vios] of Object.entries(result)) {
      console.error(`  ${file}`);
      for (const v of vios) console.error(`    L${v.line}  [${v.rule}]  ${v.detail}`);
    }
  }
  if (duplicateCount) {
    console.error(`\nMIGRATION SIRA NUMARASI CAKISMASI: ${duplicateCount} ordinal\n`);
    for (const [ordinal, names] of Object.entries(duplicateOrdinals)) {
      console.error(`  ${ordinal}: ${names.join(', ')}`);
    }
  }
  if (!showAll) {
    console.error(`\nDuzelt: ilgili DDL'i idempotent yap veya yeni migration'a benzersiz bir sira numarasi ver.`);
    console.error(`Eski ihlali kabul ettiysen: node database/lint-migrations.mjs --write-baseline > database/migration-idempotency-baseline.json\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
