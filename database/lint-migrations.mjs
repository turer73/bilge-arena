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
//
// Ayrica soru icerigi yonetisimi: migration soru icerigini/is_active'i
// degistiremez, korumayi kapatamaz, taslak/onay/yayin RPC'si cagiramaz
// (lintQuestionContentSql; ayrintisi asagida).
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

// ---------------------------------------------------------------------------
// Soru icerigi yonetisimi (106/142, docs/question-quality-system.md):
// soru icerigi ve yayin durumu yalniz iki insan onayli taslakla degisir.
// Migration dosyasi soru icerigi TASIMAZ; LLM denetim ciktisi (Antigravity
// pilotlarinin 214/215 "fix_pilot_audited_questions" paketleri gibi) migration
// olarak yazilirsa prod'da trg_question_content_direct_mutation_guard 42501 ile
// reddeder ve ardindan gelen tum migration'lar bloke olur. Bu kurallar o
// paketi CI'da durdurur. Yol: npm run revision:drafts (oneri -> taslak -> iki
// insan onayi -> yayin).
//
// Yalniz migration aninda CALISAN SQL taranir: ust seviye ifadeler ve DO
// bloklari (DO icindeki string/dollar govdeler EXECUTE ile calisabildigi icin
// acik birakilir). CREATE FUNCTION govdeleri migration aninda calismaz; ancak
// icerik yazan bir fonksiyon ayni dosyada cagrilirsa ihlal sayilir.
// Eski (grandfathered) dosyalar APPROVED_QUESTION_CONTENT_MIGRATIONS'ta
// kaynakta sabittir; --write-baseline bu kurallari susturmaz.

// 142 tetikleyicisinin korudugu questions sutunlari.
export const GUARDED_QUESTION_COLUMNS = [
  'content', 'game', 'category', 'subcategory', 'topic', 'difficulty',
  'level_tag', 'exam_ref', 'is_boss', 'is_active', 'published_revision_id',
];

// Prod'da zaten calismis, owner onayli veri migration'lari (taksonomi
// normalizasyonu, yonetisimin kendi kurulumu/backfill'i, kontrol tohumu,
// kapsam surumu) ve izin verilen ihlal sayilari. Buraya yeni dosya eklemek
// owner onayli bir "break glass" kararidir; PR'da gerekcesiyle incelenir.
// Soru METNI duzeltmesi (LLM denetim bulgusu) hicbir zaman bu yoldan gecmez.
export const APPROVED_QUESTION_CONTENT_MIGRATIONS = {
  '038_wordquest_level_tag_cleanup.sql': { 'question-content-dml': 2 },
  '046_select_random_questions_exam_ref.sql': { 'question-content-dml': 1 },
  '106_question_content_governance.sql': { 'question-content-dml': 2, 'question-guard-bypass': 1 },
  '107_tyt_exam_scope_integrity.sql': { 'question-content-dml': 1 },
  '108_exam_ref_and_category_normalization.sql': { 'question-content-dml': 2 },
  '109_canonical_category_remap.sql': { 'question-content-dml': 9 },
  '148_community_question_quality_control_seed.sql': { 'question-content-dml': 2, 'question-guard-bypass': 1 },
  '187_release_ydt_english_mastery_scope.sql': { 'question-content-dml': 1, 'question-guard-bypass': 2 },
};

// SQL'i sirayla parcala: kod, yorum, 'string', "identifier", $tag$govde$tag$.
function sqlSegments(sql) {
  const out = [];
  let i = 0;
  let codeStart = 0;
  const flush = (end) => { if (end > codeStart) out.push({ type: 'code', start: codeStart, end }); };
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    let end = -1;
    let type = null;
    let tag = null;
    if (c === '-' && next === '-') {
      type = 'comment';
      end = sql.indexOf('\n', i);
      if (end < 0) end = sql.length;
    } else if (c === '/' && next === '*') {
      type = 'comment';
      end = sql.indexOf('*/', i + 2);
      end = end < 0 ? sql.length : end + 2;
    } else if (c === "'") {
      type = 'string';
      const escapes = /[eE]/.test(sql[i - 1] ?? '') && !/[\w$]/.test(sql[i - 2] ?? '');
      let j = i + 1;
      while (j < sql.length) {
        if (escapes && sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j++;
      }
      end = Math.min(j + 1, sql.length);
    } else if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      i = j < 0 ? sql.length : j + 1;
      continue;
    } else if (c === '$' && !/[\w$]/.test(sql[i - 1] ?? '')) {
      const m = /^\$([A-Za-z_][\w]*)?\$/.exec(sql.slice(i));
      if (m) {
        type = 'dollar';
        tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        end = close < 0 ? sql.length : close + tag.length;
      }
    }
    if (!type) { i++; continue; }
    flush(i);
    out.push({ type, start: i, end, tag });
    i = end;
    codeStart = end;
  }
  flush(sql.length);
  return out;
}

const DO_BEFORE = /\bDO\s*(?:LANGUAGE\s+\w+\s*)?$/i;
const FUNCTION_HEADER = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+((?:"?\w+"?\.)?"?\w+"?)\s*\(/gi;

// Migration aninda calisan SQL gorunumu (uzunluk ve satirlar korunur) ve
// fonksiyon govdeleri. insideDo: DO govdesi; string ve dollar icerik acik kalir.
// openView: ust seviye string argumanlari da acik (SELECT set_config('...')).
function executableView(sql, insideDo = false) {
  const functions = [];
  let view = '';
  let openView = '';
  let code = '';
  const emit = (both, open = both) => { view += both; openView += open; };
  for (const seg of sqlSegments(sql)) {
    const text = sql.slice(seg.start, seg.end);
    if (seg.type === 'code') { emit(text); code += text; continue; }
    if (seg.type === 'comment') { emit(blank(text)); continue; }
    if (insideDo) { emit(text); continue; }
    if (seg.type === 'dollar' && DO_BEFORE.test(code)) {
      const inner = executableView(text.slice(seg.tag.length, text.length - seg.tag.length), true).view;
      emit(blank(seg.tag) + inner + blank(seg.tag));
      continue;
    }
    const header = [...code.matchAll(FUNCTION_HEADER)].pop();
    if (header && /\bAS\s*$/i.test(code)) {
      const body = seg.type === 'dollar' ? text.slice(seg.tag.length, text.length - seg.tag.length) : text.slice(1, -1);
      functions.push({ name: header[1].replace(/"/g, '').replace(/^\w+\./, '').toLowerCase(), body });
      emit(blank(text));
      continue;
    }
    emit(blank(text), seg.type === 'string' ? text : blank(text));
  }
  return { view, openView, functions };
}

const TABLE = (name) => `(?:ONLY\\s+)?(?:"?public"?\\.)?"?${name}"?(?![\\w"])`;
const TABLE_LIST = `(?:(?:ONLY\\s+)?[\\w."]+\\s*,\\s*)*`;
// Migration'in insan adina taslak/onay/yayin/karantina yapmasi veya korumayi
// kapatmasi: bunlar iki insan onayli yonetisim eylemleridir.
export const GOVERNANCE_WRITE_RPCS = [
  'create_governed_question', 'create_question_content_revision', 'review_question_content_revision',
  'publish_question_content_revision', 'quarantine_question_content', 'set_content_governance_enforcement',
  'content_governance_authorize_question_write', 'publish_question_turkish_restoration',
];
// Gercek cagri mi? Haric: CREATE/ALTER/DROP/COMMENT/GRANT/REVOKE ifadelerindeki
// imza listeleri, TRIGGER ... EXECUTE FUNCTION, daha uzun bir adin parcasi ve
// 'public.f(uuid)' gibi imza metinleri (to_regprocedure, has_function_privilege).
const NON_CALL_STATEMENT = /^\s*(?:CREATE|ALTER|DROP|COMMENT|GRANT|REVOKE)\b/i;
const isCallSite = (view, index) => {
  const before = view.slice(0, index);
  if (/[\w.']$/.test(before) || /\b(?:FUNCTION|PROCEDURE)(?:\s+IF\s+EXISTS)?\s*$/i.test(before)) return false;
  return !NON_CALL_STATEMENT.test(view.slice(view.lastIndexOf(';', index - 1) + 1, index));
};
const statementAt = (s, index) => {
  const end = s.indexOf(';', index);
  return s.slice(index, end < 0 ? s.length : end);
};

function questionContentDml(view) {
  const hits = [];
  const add = (detail, index) => hits.push({ detail, index });
  for (const m of view.matchAll(new RegExp(`\\bUPDATE\\s+${TABLE('questions')}`, 'gi'))) {
    const stmt = statementAt(view, m.index);
    const set = /\bSET\b([\s\S]*?)(?:\bWHERE\b|\bFROM\b|\bRETURNING\b|$)/i.exec(stmt);
    const touched = set ? GUARDED_QUESTION_COLUMNS.filter((col) => new RegExp(`\\b${col}\\b`, 'i').test(set[1])) : ['?'];
    if (touched.length) add(`UPDATE questions touches ${touched.join(', ')}`, m.index);
  }
  const writes = [
    [`\\bINSERT\\s+INTO\\s+${TABLE('questions')}`, 'INSERT INTO questions'],
    [`\\bDELETE\\s+FROM\\s+${TABLE('questions')}`, 'DELETE FROM questions'],
    [`\\bMERGE\\s+INTO\\s+${TABLE('questions')}`, 'MERGE INTO questions'],
    [`\\bCOPY\\s+${TABLE('questions')}`, 'COPY questions'],
    [`\\bTRUNCATE\\s+(?:TABLE\\s+)?${TABLE_LIST}${TABLE('questions')}`, 'TRUNCATE questions'],
    [`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|MERGE\\s+INTO|COPY)\\s+${TABLE('question_content_revisions')}`, 'write to question_content_revisions'],
    [`\\bTRUNCATE\\s+(?:TABLE\\s+)?${TABLE_LIST}${TABLE('question_content_revisions')}`, 'TRUNCATE question_content_revisions'],
  ];
  for (const [pattern, detail] of writes) {
    for (const m of view.matchAll(new RegExp(pattern, 'gi'))) add(detail, m.index);
  }
  return hits;
}

function questionGuardBypass(view, openView = view) {
  const hits = [];
  const add = (detail, index) => hits.push({ detail, index });
  for (const m of view.matchAll(/\bALTER\s+TABLE\b[^;]*?\bquestions"?\s+(?:[^;]*?\s)?DISABLE\s+TRIGGER\b/gi)) {
    add('ALTER TABLE questions DISABLE TRIGGER', m.index);
  }
  for (const m of openView.matchAll(/\bsession_replication_role\b/gi)) add('session_replication_role bypasses triggers', m.index);
  for (const name of GOVERNANCE_WRITE_RPCS) {
    for (const m of view.matchAll(new RegExp(`(?:"?public"?\\.)?"?${name}"?\\s*\\(`, 'gi'))) {
      if (isCallSite(view, m.index)) add(`calls governance RPC ${name}(); drafts, reviews and publishes are human actions`, m.index);
    }
  }
  for (const m of view.matchAll(new RegExp(`\\b(?:UPDATE|INSERT\\s+INTO)\\s+${TABLE('content_governance_runtime')}`, 'gi'))) {
    if (/\benforce_direct_mutation\b/i.test(statementAt(view, m.index))) add('write to content_governance_runtime.enforce_direct_mutation', m.index);
  }
  const recreated = new Set([...view.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([\w."]+)/gi)].map((m) => normName(m[1])));
  for (const m of view.matchAll(/\bDROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?([\w."]+)\s+ON\s+(?:"?public"?\.)?"?questions"?(?![\w"])/gi)) {
    if (!recreated.has(normName(m[1]))) add(`DROP TRIGGER ${m[1]} ON questions without re-creating it`, m.index);
  }
  return hits;
}

// Soru icerigi kurallari. Donen: [{ rule, detail, line }]
export function lintQuestionContentSql(sql) {
  const { view, openView, functions } = executableView(sql);
  const violations = [];
  const add = (rule, { detail, index }) => violations.push({ rule, detail, line: lineOf(view, index) });
  for (const hit of questionContentDml(view)) add('question-content-dml', hit);
  for (const hit of questionGuardBypass(view, openView)) add('question-guard-bypass', hit);
  // Icerik yazan fonksiyonu ayni dosyada tanimlayip cagirmak (SELECT f(); / PERFORM f();)
  for (const fn of functions) {
    const inner = executableView(fn.body, true).view;
    if (!questionContentDml(inner).length && !questionGuardBypass(inner).length) continue;
    const call = new RegExp(`(?:"?\\w+"?\\.)?"?${fn.name}"?\\s*\\(`, 'gi');
    for (const m of view.matchAll(call)) {
      if (isCallSite(view, m.index)) add('question-content-dml', { detail: `calls ${fn.name}(), which writes question content`, index: m.index });
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}

export function lintAllQuestionContent(dir = MIGRATIONS_DIR) {
  const out = {};
  for (const f of migrationFiles(dir)) {
    const v = lintQuestionContentSql(readFileSync(join(dir, f), 'utf8'));
    if (v.length) out[f] = v;
  }
  return out;
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

// Onaylanmamis soru icerigi ihlalleri: { file -> [violation] }.
export function newQuestionContentViolations(all = lintAllQuestionContent(), approved = APPROVED_QUESTION_CONTENT_MIGRATIONS) {
  return newViolations(all, approved);
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
  const contentAll = lintAllQuestionContent();
  const content = showAll ? contentAll : newQuestionContentViolations(contentAll);
  const contentCount = Object.keys(content).length;

  if (contentCount) {
    console.error(`\nSORU ICERIGI MIGRATION ILE DEGISMEZ ${showAll ? '(tum ihlaller, onaylilar dahil)' : ''}: ${contentCount} dosya\n`);
    for (const [file, vios] of Object.entries(content)) {
      console.error(`  ${file}`);
      for (const v of vios) console.error(`    L${v.line}  [${v.rule}]  ${v.detail}`);
    }
    if (!showAll) {
      console.error('\nSoru icerigi ve is_active yalniz iki insan onayli taslakla degisir; prod tetikleyicisi bu SQL\'i 42501 ile reddeder');
      console.error('ve ardindan gelen migration\'lar bloke olur. Yol: oneri dosyasi -> npm run revision:drafts -> iki insan onayi -> yayin');
      console.error('(docs/question-quality-system.md). --write-baseline bu kurali susturmaz.\n');
      process.exitCode = 1;
    }
  }
  if (!fileCount && !duplicateCount) {
    if (!contentCount) console.log(`OK: ${totalFiles} migration tarandi, ${showAll ? '' : 'baseline-disi '}idempotency, sira numarasi veya soru icerigi ihlali yok.`);
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
