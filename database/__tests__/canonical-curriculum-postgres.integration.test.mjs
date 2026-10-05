// Opt-in real PostgreSQL, ALWAYS a newly initialized loopback-only cluster.
// CANONICAL_PG_BIN=<directory containing initdb/pg_ctl> node --test <this file>
// No external connection URL is accepted. Test cluster is stopped and retained for diagnostics.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { buildCanonicalCatalogPlan, bindCanonicalCatalogPlan } from '../canonical-curriculum.mjs'

const testing = process.env.VITEST ? await import('vitest') : await import('node:test')
const before = testing.beforeAll ?? testing.before, after = testing.afterAll ?? testing.after
const { describe, it, beforeEach, afterEach } = testing
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sql = readFileSync(join(root, 'database/migrations/219_curriculum_canonical_identity.sql'), 'utf8')
const runtimeSql = readFileSync(join(root, 'database/migrations/220_canonical_mastery_read.sql'), 'utf8')
const registrySql = readFileSync(join(root, 'database/migrations/178_curriculum_scope_release_registry.sql'), 'utf8')
const registryFunction = name => {
  const start = registrySql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  assert.ok(start >= 0)
  return registrySql.slice(start, registrySql.indexOf('$fn$;', registrySql.indexOf('AS $fn$', start)) + 5)
}
const scopeSql = readFileSync(join(root, 'database/migrations/164_question_revision_outcome_scope.sql'), 'utf8')
  .match(/CREATE OR REPLACE FUNCTION public\.curriculum_outcome_scope_valid\([\s\S]*?\$fn\$;/)?.[0]
assert.ok(scopeSql, 'use the actual migration-164 guard, never a permissive mock')
const pgBin = process.env.CANONICAL_PG_BIN
if (pgBin) assert.ok(isAbsolute(pgBin), 'PG binary directory must be absolute')
const executable = name => join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
const run = (name, args) => execFileSync(executable(name), args,
  // A Windows postgres child can inherit a pipe after pg_ctl itself exits.
  // Server diagnostics already go to the cluster log, so no pg_ctl pipes.
  { windowsHide: true, encoding: 'utf8', timeout: 60000, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' })
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const key = 'meb-turkce@2019:grade8:LGS:T.8.3.25'
const receipt = { reviewedCanonicalId: 'fixture-v2', url: 'https://example.org/test.pdf',
  responseSha256: 'a'.repeat(64), pageTextSha256: 'b'.repeat(64), packageSha256: 'c'.repeat(64),
  pdfPage: 40, extractor: 'pypdf', extractorVersion: '6.10.0' }
const path = [{ nodeType: 'course', title: 'Türkçe', officialCode: null },
  { nodeType: 'language_skill', title: 'Okuma', officialCode: null },
  { nodeType: 'outcome', title: 'Test kazanımı.', officialCode: 'T.8.3.25' }]

;(pgBin ? describe : describe.skip)('canonical identity on isolated PostgreSQL', () => {
  let db, cluster, started = false, initialGuard, initialExisting
  const query = (s, values) => db.query(s, values)
  async function readCatalog(game = 'turkce', exam = 'LGS', taxonomy = 'test@1') {
    return (await query('SELECT public.read_canonical_curriculum_catalog($1,$2,$3) AS result', [game, exam, taxonomy])).rows[0].result
  }
  async function addCanonical(overrides = {}) {
    const row = { canonical_id: key, program_key: 'meb-turkce', program_edition: '2019', grade: 8,
      exam_ref: 'LGS', game: 'turkce', official_code: 'T.8.3.25', title: 'Test kazanımı.',
      official_path: path, source_receipt: receipt, ...overrides }
    const fields = Object.keys(row)
    // Fields come only from this closed test fixture, not user-supplied SQL.
    return query(`INSERT INTO public.curriculum_canonical_outcomes(${fields.join(',')})
      VALUES(${fields.map((_, i) => `$${i + 1}`).join(',')})`,
    Object.values(row).map(v => typeof v === 'object' ? JSON.stringify(v) : v))
  }
  const link = (n, taxonomy = 'test@1', canonicalId = key) => query(`
    INSERT INTO public.curriculum_outcome_canonical_links(outcome_id,canonical_id,taxonomy_version,package_sha256)
    VALUES($1,$2,$3,$4)`, [id(n), canonicalId, taxonomy, 'c'.repeat(64)])
  async function seed() { await addCanonical(); await link(11); await link(12) }
  const fail = (promise, code) => assert.rejects(promise, e => e.code === code)
  const existing = async () => (await query(`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.curriculum_outcomes t) AS outcomes,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.curriculum_nodes t) AS nodes,
    (SELECT jsonb_agg(to_jsonb(t)) FROM public.questions t) AS questions,
    (SELECT jsonb_agg(to_jsonb(t)) FROM public.user_outcome_state t) AS mastery,
    (SELECT jsonb_agg(to_jsonb(t)) FROM public.curriculum_scope_releases t) AS releases`)).rows[0]

  before(async () => {
    for (const name of ['initdb', 'pg_ctl']) assert.ok(existsSync(executable(name)), `missing ${name}`)
    cluster = mkdtempSync(join(tmpdir(), 'bilge-canonical-pg-'))
    const data = join(cluster, 'data')
    run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--no-locale', '-E', 'UTF8'])
    const port = await new Promise((resolvePort, reject) => {
      const socket = createServer()
      socket.once('error', reject)
      socket.listen(0, '127.0.0.1', () => {
        const selected = socket.address().port
        socket.close(error => error ? reject(error) : resolvePort(selected))
      })
    })
    // Only our fresh directory and loopback. No shell or existing DB instance.
    started = true // also clean up if startup returns an error after launching the server
    run('pg_ctl', ['-D', data, '-l', join(cluster, 'postgres.log'), '-w', '-t', '30',
      '-o', `-F -h 127.0.0.1 -p ${port}`, 'start'])
    db = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', connectionTimeoutMillis: 5000 })
    await db.connect()
    await query("SET TIME ZONE 'UTC'")
    const serverData = (await query('SHOW data_directory')).rows[0].data_directory
    assert.equal(realpathSync(serverData).toLowerCase(), realpathSync(data).toLowerCase(), 'refuse any existing cluster')
    await query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE TABLE public.curriculum_nodes(id uuid PRIMARY KEY, parent_id uuid REFERENCES public.curriculum_nodes,
        node_type text, game text, category text, exam_ref text, taxonomy_version text, title text, is_active boolean);
      CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY, code text UNIQUE, game text, category text,
        exam_ref text, taxonomy_version text, node_id uuid REFERENCES public.curriculum_nodes, title text, is_active boolean);
      CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game text, category text,
        exam_ref text, is_active boolean DEFAULT false, payload jsonb);
      INSERT INTO public.questions(payload) VALUES ('{"unchanged":true}');
      CREATE TABLE public.user_outcome_state(payload jsonb); INSERT INTO public.user_outcome_state VALUES ('{"attempts":7}');
      CREATE TABLE public.curriculum_scope_releases(game text, display_exam_ref text, question_exam_ref text,
        taxonomy_version text, release_status text, mapping_mode text CHECK(mapping_mode IN ('category_proxy')),
        diagnostic_enabled boolean, released_at timestamptz, PRIMARY KEY(game,display_exam_ref));
      CREATE TABLE public.question_outcomes(question_id uuid, outcome_id uuid, is_primary boolean, mapping_source text,
        weight numeric, PRIMARY KEY(question_id,outcome_id));
      CREATE TABLE public.game_sessions(id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.verified_attempts(id uuid PRIMARY KEY, user_id uuid, session_id uuid, completed_at timestamptz, question_ids uuid[]);
      CREATE TABLE public.session_answers(id uuid PRIMARY KEY, user_id uuid, question_id uuid, session_id uuid,
        is_skipped boolean, is_correct boolean, answered_at timestamptz);
      CREATE TABLE public.review_logs(id uuid PRIMARY KEY, user_id uuid, answer_id uuid);
      CREATE TABLE public.review_error_annotations(review_log_id uuid PRIMARY KEY, reason_code text);
      CREATE TABLE public.mastery_outcome_evidence(answer_id uuid, outcome_id uuid, user_id uuid, question_id uuid,
        session_id uuid, attempt_id uuid, is_correct boolean, mapping_weight numeric, difficulty integer,
        time_taken_sec numeric, fast_wrong boolean, max_hint_stage integer, delayed_correct boolean,
        verified_completed_at timestamptz NOT NULL,
        evidence_day_tr date GENERATED ALWAYS AS ((verified_completed_at AT TIME ZONE 'Europe/Istanbul')::date) STORED,
        PRIMARY KEY(answer_id,outcome_id));
      ALTER TABLE public.mastery_outcome_evidence ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT SELECT ON public.curriculum_outcomes, public.curriculum_nodes, public.game_sessions,
        public.verified_attempts, public.session_answers, public.review_logs, public.review_error_annotations TO service_role;`)
    for (const [n, parent, type, category, title] of [
      [1, null, 'course', null, 'Türkçe'], [2, 1, 'unit', null, 'Okuma'],
      [3, 2, 'topic', 'dil_bilgisi', 'depolama bağlantısı'], [4, 2, 'topic', 'paragraf', 'depolama bağlantısı'],
      [5, 3, 'outcome', 'dil_bilgisi', 'Test kazanımı.'], [6, 4, 'outcome', 'paragraf', 'Test kazanımı.'],
    ]) await query(`INSERT INTO public.curriculum_nodes VALUES($1,$2,$3,'turkce',$4,'LGS','test@1',$5,true)`,
      [id(n), parent ? id(parent) : null, type, category, title])
    for (const [n, node, category] of [[11, 5, 'dil_bilgisi'], [12, 6, 'paragraf']]) {
      await query(`INSERT INTO public.curriculum_outcomes VALUES($1,$2,'turkce',$3,'LGS','test@1',$4,'Test kazanımı.',true)`,
        [id(n), `ALIAS-${n}`, category, id(node)])
    }
    await query(scopeSql)
    await query('REVOKE ALL ON FUNCTION public.curriculum_outcome_scope_valid(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role')
    initialGuard = (await query("SELECT pg_get_functiondef('public.curriculum_outcome_scope_valid(uuid,text,text,text)'::regprocedure) AS body")).rows[0].body
    initialExisting = await existing()
    await query(sql)
    await query(sql)
    await query(registryFunction('resolve_released_curriculum_scope'))
    await query(registryFunction('curriculum_scope_integrity'))
    await query(`REVOKE ALL ON FUNCTION public.resolve_released_curriculum_scope(text,text),
      public.curriculum_scope_integrity(text,text,text) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.resolve_released_curriculum_scope(text,text),
      public.curriculum_scope_integrity(text,text,text) TO service_role;`)
    await query(runtimeSql)
    await query(runtimeSql)
  }, 120000)
  after(async () => {
    if (db) await db.end()
    if (started) {
      let running = false
      try { run('pg_ctl', ['-D', join(cluster, 'data'), 'status']); running = true }
      catch (e) { if (e.status !== 3) throw e }
      if (running) run('pg_ctl', ['-D', join(cluster, 'data'), '-m', 'fast', '-w', 'stop'])
    }
    if (cluster) console.log(`Disposable PostgreSQL is stopped; diagnostics retained at ${cluster}`)
  }, 60000)
  beforeEach(async () => { await query('BEGIN') })
  afterEach(async () => { await query('ROLLBACK') })

  it('is replayable, imports no records, and leaves old data/guard unchanged', async () => {
    assert.deepEqual(await existing(), initialExisting)
    assert.equal((await query('SELECT count(*)::int AS n FROM public.curriculum_canonical_outcomes')).rows[0].n, 0)
    const now = (await query("SELECT pg_get_functiondef('public.curriculum_outcome_scope_valid(uuid,text,text,text)'::regprocedure) AS body")).rows[0].body
    assert.equal(now, initialGuard)
  })
  it('deduplicates aliases and returns only official paths', async () => {
    await seed()
    await query('SET LOCAL ROLE service_role')
    const result = await readCatalog()
    assert.equal(result.catalogStatus, 'complete')
    assert.equal(result.legacyOutcomeCount, 2)
    assert.equal(result.canonicalOutcomeCount, 1)
    assert.equal(result.items[0].aliases.length, 2)
    assert.deepEqual(result.items[0].path, path)
    assert.equal(JSON.stringify(result).includes('depolama bağlantısı'), false)
    assert.equal(result.learnerReady, false)
    assert.equal(result.publicationAuthorized, false)
  })
  it('fails closed if even one active alias is unlinked', async () => {
    await addCanonical(); await link(11)
    const result = await readCatalog()
    assert.equal(result.catalogStatus, 'incomplete')
    assert.deepEqual(result.invalidOutcomeIds, [id(12)])
    assert.deepEqual(result.items, [])
  })
  it('returns empty, never ready, for an unknown scope', async () => {
    const result = await readCatalog('turkce', 'TYT')
    assert.equal(result.catalogStatus, 'empty')
    assert.equal(result.learnerReady, false)
  })
  it('requires explicit scope arguments', async () => { await fail(readCatalog(null), '22023') })
  for (const role of ['anon', 'authenticated']) {
    it(`denies the reader to ${role}`, async () => {
      await query(`SET LOCAL ROLE ${role}`)
      await fail(readCatalog(), '42501')
    })
    it(`denies raw registry access to ${role}`, async () => {
      await query(`SET LOCAL ROLE ${role}`)
      await fail(query('SELECT * FROM public.curriculum_canonical_outcomes'), '42501')
    })
  }
  it('does not let service_role insert a canonical record', async () => {
    await query('SET LOCAL ROLE service_role')
    await fail(addCanonical(), '42501')
  })
  it('does not let service_role insert a link', async () => {
    await addCanonical()
    await query('SET LOCAL ROLE service_role')
    await fail(link(11), '42501')
  })
  it('enforces RLS and explicit privileges, with an invoker reader', async () => {
    const rows = (await query(`SELECT relname,relrowsecurity FROM pg_class WHERE oid IN
      ('public.curriculum_canonical_outcomes'::regclass,'public.curriculum_outcome_canonical_links'::regclass)`)).rows
    assert.ok(rows.every(r => r.relrowsecurity))
    const f = (await query(`SELECT prosecdef, proconfig FROM pg_proc
      WHERE oid='public.read_canonical_curriculum_catalog(text,text,text)'::regprocedure`)).rows[0]
    assert.equal(f.prosecdef, false)
    assert.ok(f.proconfig.includes('search_path=pg_catalog'))
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const table of ['curriculum_canonical_outcomes', 'curriculum_outcome_canonical_links']) {
        for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
          assert.equal((await query('SELECT has_table_privilege($1,$2,$3) AS ok', [role, `public.${table}`, privilege])).rows[0].ok, false)
        }
      }
    }
  })
  it('requires the natural edition identity to match its fields', async () => { await fail(addCanonical({ canonical_id: `${key}-wrong` }), '23514') })
  it('rejects missing source receipt fields', async () => { await fail(addCanonical({ source_receipt: {} }), '23514') })
  it('rejects null source hashes', async () => { await fail(addCanonical({ source_receipt: { ...receipt, responseSha256: null } }), '23514') })
  it('rejects storage bridges in the canonical path', async () => {
    await fail(addCanonical({ official_path: [path[0], { ...path[1], isInternalBridge: true }, path[2]] }), '23514')
  })
  it('rejects path/code contradictions', async () => {
    await fail(addCanonical({ official_path: [path[0], { ...path[2], officialCode: 'T.8.3.10' }] }), '23514')
  })
  it('rejects a link across games', async () => { await addCanonical({ game: 'fen' }); await fail(link(11), '23514') })
  it('rejects a link across exams', async () => {
    const other = key.replace(':LGS:', ':TYT:')
    await addCanonical({ exam_ref: 'TYT', canonical_id: other }); await fail(link(11, 'test@1', other), '23514')
  })
  it('rejects a link across taxonomy versions', async () => { await addCanonical(); await fail(link(11, 'other'), '23514') })
  it('rejects a link with a stale legacy title', async () => {
    await addCanonical()
    await query('UPDATE public.curriculum_outcomes SET title=$1 WHERE id=$2', ['Changed definition.', id(11)])
    await fail(link(11), '23514')
  })
  it('rejects unknown legacy UUIDs', async () => { await addCanonical(); await fail(link(99), '23503') })
  it('rejects alias rewiring after registration', async () => {
    await seed(); await fail(query('UPDATE public.curriculum_outcome_canonical_links SET taxonomy_version=$1', ['other']), '42501')
  })
  it('rejects silent canonical definition changes', async () => {
    await seed(); await fail(query("UPDATE public.curriculum_canonical_outcomes SET title='Changed'"), '42501')
  })
  it('rejects canonical deletion', async () => {
    await seed(); await fail(query('DELETE FROM public.curriculum_canonical_outcomes'), '42501')
  })
  it('rechecks scope after an old taxonomy changes', async () => {
    await seed()
    await query('UPDATE public.curriculum_outcome_canonical_links SET taxonomy_version=taxonomy_version WHERE false')
    await query('UPDATE public.curriculum_outcomes SET taxonomy_version=$1 WHERE id=$2', ['other', id(11)])
    const result = await readCatalog('turkce', 'LGS', 'other')
    assert.equal(result.catalogStatus, 'incomplete')
    assert.deepEqual(result.invalidOutcomeIds, [id(11)])
  })
  it('still enforces exact category and the original four-level chain', async () => {
    await seed()
    const mismatch = (await query('SELECT public.curriculum_outcome_scope_valid($1,$2,$3,$4) AS ok', [id(11), 'turkce', 'paragraf', 'LGS'])).rows[0].ok
    assert.equal(mismatch, false)
    await query('UPDATE public.curriculum_nodes SET parent_id=$1 WHERE id=$2', [id(2), id(5)])
    const result = await readCatalog()
    assert.equal(result.catalogStatus, 'incomplete')
    assert.deepEqual(result.invalidOutcomeIds, [id(11)])
  })
  it('does not count inactive aliases', async () => {
    await seed(); await query('UPDATE public.curriculum_outcomes SET is_active=false WHERE id=$1', [id(12)])
    const result = await readCatalog()
    assert.equal(result.catalogStatus, 'complete')
    assert.equal(result.legacyOutcomeCount, 1)
    assert.equal(result.canonicalOutcomeCount, 1)
  })
  it('fails closed when a linked legacy definition is later changed', async () => {
    await seed()
    await query('UPDATE public.curriculum_outcomes SET title=$1 WHERE id=$2', ['Changed definition.', id(11)])
    const result = await readCatalog()
    assert.equal(result.catalogStatus, 'incomplete')
    assert.deepEqual(result.invalidOutcomeIds, [id(11)])
  })

  async function runtimeSeed() {
    await seed()
    await query(`INSERT INTO public.curriculum_scope_releases VALUES
      ('turkce','LGS','LGS','test@1','released','canonical_reviewed',false,now())`)
    for (const [n, alias, category] of [[201, 11, 'dil_bilgisi'], [202, 12, 'paragraf']]) {
      await query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active) VALUES($1,'turkce',$2,'LGS',true)`, [id(n), category])
      await query(`INSERT INTO public.question_outcomes VALUES($1,$2,true,'reviewed',1)`, [id(n), id(alias)])
    }
  }
  async function evidence(n, day, { user = 301, aliases = [11, 12], correct = true, weight = 1 } = {}) {
    const session = id(n + 1000), attempt = id(n + 2000), answer = id(n + 3000)
    await query('INSERT INTO public.game_sessions VALUES($1,$2)', [session, id(user)])
    await query('INSERT INTO public.verified_attempts VALUES($1,$2,$3,$4,ARRAY[$5]::uuid[])', [attempt, id(user), session, day, id(201)])
    await query('INSERT INTO public.session_answers VALUES($1,$2,$3,$4,false,$5,$6)', [answer, id(user), id(201), session, correct, day])
    for (const alias of aliases) await query(`INSERT INTO public.mastery_outcome_evidence(
      answer_id,outcome_id,user_id,question_id,session_id,attempt_id,is_correct,mapping_weight,difficulty,
      time_taken_sec,fast_wrong,max_hint_stage,delayed_correct,verified_completed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,2,20,$9,1,$7,$10)`,
    [answer, id(alias), id(user), id(201), session, attempt, correct, weight, !correct, day])
    return { answer, session, attempt }
  }
  const readRuntime = async (user = 301, taxonomy = 'test@1') => (await query(
    'SELECT public.read_canonical_mastery_context($1,$2,$3,$4) AS result', [id(user), 'turkce', 'LGS', taxonomy])).rows[0].result
  it('canonical runtime is invoker, service only and raw evidence is not client-readable', async () => {
    const f = (await query("SELECT prosecdef FROM pg_proc WHERE oid='public.read_canonical_mastery_context(uuid,text,text,text)'::regprocedure")).rows[0]
    assert.equal(f.prosecdef, false)
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await query("SELECT has_function_privilege($1,'public.read_canonical_mastery_context(uuid,text,text,text)','EXECUTE') AS ok", [role])).rows[0].ok, false)
      assert.equal((await query("SELECT has_table_privilege($1,'public.mastery_outcome_evidence','SELECT') AS ok", [role])).rows[0].ok, false)
    }
    assert.equal((await query("SELECT has_table_privilege('service_role','public.mastery_outcome_evidence','UPDATE') AS ok")).rows[0].ok, false)
  })
  it('requires release, exact taxonomy and existing integrity; no fallback to aliases', async () => {
    await runtimeSeed()
    assert.ok(await readRuntime())
    assert.equal(await readRuntime(301, 'other'), null)
    await query("UPDATE public.curriculum_scope_releases SET release_status='validating'")
    assert.equal(await readRuntime(), null)
    await query("UPDATE public.curriculum_scope_releases SET release_status='released'")
    await query('DELETE FROM public.question_outcomes WHERE outcome_id=$1', [id(12)])
    assert.equal(await readRuntime(), null)
  })
  it('deduplicates answers and verified days across aliases and isolates users', async () => {
    await runtimeSeed()
    await evidence(401, '2026-10-04T20:59:00Z')
    await evidence(402, '2026-10-04T21:01:00Z', { correct: false })
    await evidence(403, '2026-10-04T22:00:00Z')
    await evidence(404, '2026-10-05T23:00:00Z', { user: 302 })
    await query('SET LOCAL ROLE service_role')
    const result = await readRuntime()
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].aliases.length, 2)
    assert.equal(result.states.length, 1)
    assert.deepEqual(result.states[0], { outcome_id: key, attempts: 3, correct_attempts: 2,
      weighted_earned: 2, weighted_possible: 3, delayed_correct: 2, v2_attempts: 3,
      difficulty_weighted_earned: 4, difficulty_weighted_possible: 6, timed_attempts: 3,
      total_time_sec: 60, fast_wrong: 1, hinted_attempts: 3, hint_stage_sum: 3,
      guess_annotations: 0, careless_annotations: 0, verified_evidence_days: 2,
      last_answered_at: '2026-10-04T22:00:00+00:00' })
    assert.equal((await readRuntime(302)).states[0].attempts, 1)
    assert.deepEqual((await readRuntime(303)).states, [])
  })
  it('uses maximum alias weight rather than adding it, and distinct answer annotations', async () => {
    await runtimeSeed()
    const { answer } = await evidence(401, '2026-10-04T20:59:00Z', { correct: false, weight: 0.5 })
    await query('UPDATE public.mastery_outcome_evidence SET mapping_weight=1 WHERE outcome_id=$1', [id(12)])
    await query('INSERT INTO public.review_logs VALUES($1,$2,$3)', [id(501), id(301), answer])
    await query("INSERT INTO public.review_error_annotations VALUES($1,'guess')", [id(501)])
    const state = (await readRuntime()).states[0]
    assert.equal(state.weighted_possible, 1)
    assert.equal(state.difficulty_weighted_possible, 2)
    assert.equal(state.guess_annotations, 1)
  })
  for (const [name, sql] of [
    ['conflicting alias metadata', "UPDATE public.mastery_outcome_evidence SET time_taken_sec=99 WHERE outcome_id='" + id(12) + "'"],
    ['unverified attempt', 'UPDATE public.verified_attempts SET completed_at=NULL'],
    ['wrong session owner', "UPDATE public.game_sessions SET user_id='" + id(302) + "'"],
    ['skipped answer', 'UPDATE public.session_answers SET is_skipped=true'],
    ['answer correctness conflict', 'UPDATE public.session_answers SET is_correct=false'],
    ['wrong question pin', "UPDATE public.verified_attempts SET question_ids='{}'::uuid[]"],
  ]) it(`refuses ${name} instead of producing a partial score`, async () => {
    await runtimeSeed(); await evidence(401, '2026-10-04T20:59:00Z')
    await query(sql)
    assert.equal(await readRuntime(), null)
  })
  it('does not count answer timestamps as verified evidence days', async () => {
    await runtimeSeed(); await evidence(401, '2026-10-04T20:59:00Z'); await evidence(402, '2026-10-04T20:59:00Z')
    await query("UPDATE public.session_answers SET answered_at='2026-09-01T00:00:00Z' WHERE id=$1", [id(3401)])
    assert.equal((await readRuntime()).states[0].verified_evidence_days, 1)
  })
  it('does not invent category-proxy mappings for canonical scopes', async () => {
    await runtimeSeed()
    await query('SELECT public.sync_taxonomy_auto_question_outcomes($1,$2,$3,$4,true)', [id(201), 'turkce', 'LGS', 'dil_bilgisi'])
    assert.equal((await query("SELECT count(*)::int AS n FROM public.question_outcomes WHERE mapping_source='taxonomy_auto'")).rows[0].n, 0)
    assert.equal((await query('SELECT count(*)::int AS n FROM public.question_outcomes')).rows[0].n, 2)
  })
  it('cannot enable alias-based diagnostics for canonical practice scopes', async () => {
    await runtimeSeed()
    await fail(query('UPDATE public.curriculum_scope_releases SET diagnostic_enabled=true'), '23514')
  })
  const packageDir = process.env.CANONICAL_REVIEW_PACKAGE
  ;(packageDir ? it : it.skip)('rehearses the hash-pinned real package with fixture UUIDs, without source acceptance', async () => {
    assert.ok(isAbsolute(packageDir))
    const read = name => JSON.parse(readFileSync(join(packageDir, name), 'utf8'))
    const verification = read('verification.json')
    const sha = bytes => createHash('sha256').update(bytes).digest('hex')
    for (const [name, expected] of Object.entries(verification.filesSha256)) {
      const target = resolve(packageDir, name)
      assert.ok(target.startsWith(resolve(packageDir) + (process.platform === 'win32' ? '\\' : '/')), 'hash path must stay in package')
      assert.equal(sha(readFileSync(target)), expected, name)
    }
    const packageSha256 = sha(Object.keys(verification.filesSha256).sort()
      .map(name => `${verification.filesSha256[name]}  ${name}`).join('\n'))
    assert.equal(packageSha256, 'd84e0a1c49205cd1dca3b779658946098156448ee0a19955c95ed37adee22769')
    const projection = read('storage-projection.json')
    const plan = buildCanonicalCatalogPlan({ catalog: read('catalog-candidates.json'), projection, packageSha256,
      programEditions: {
        'meb2018-dkab': { programKey: 'meb-dkab', edition: '2018' },
        'meb2018-inkilap8': { programKey: 'meb-inkilap8', edition: '2018' },
        'meb2018-fen': { programKey: 'meb-fen', edition: '2018' },
        'meb2018-matematik': { programKey: 'meb-matematik', edition: '2018' },
        'meb2019-turkce': { programKey: 'meb-turkce', edition: '2019' },
      } })
    assert.equal(plan.canonicalOutcomes.length, 51)
    assert.equal(plan.aliasBindings.length, 52)
    const nodeIds = new Map(projection.nodes.map((n, i) => [n.code, id(1000 + i)]))
    const inserted = new Set()
    let pending = projection.nodes.slice()
    while (pending.length) {
      const ready = pending.filter(n => n.parentCode === null || inserted.has(n.parentCode))
      assert.ok(ready.length, 'projection cannot contain a cycle or orphan')
      for (const n of ready) {
        await query(`INSERT INTO public.curriculum_nodes VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)`,
          [nodeIds.get(n.code), n.parentCode === null ? null : nodeIds.get(n.parentCode), n.nodeType,
            n.game, n.category ?? null, n.examRef, n.taxonomyVersion, n.title])
        inserted.add(n.code)
      }
      pending = pending.filter(n => !inserted.has(n.code))
    }
    const legacy = []
    for (const [i, a] of projection.outcomes.entries()) {
      const row = { id: id(2000 + i), code: a.code, game: a.game, category: a.category,
        exam_ref: a.examRef, taxonomy_version: a.taxonomyVersion, node_id: nodeIds.get(a.nodeCode), title: a.title }
      await query(`INSERT INTO public.curriculum_outcomes VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)`, Object.values(row))
      legacy.push(row)
    }
    for (const row of plan.canonicalOutcomes) await addCanonical(row)
    for (const row of bindCanonicalCatalogPlan(plan, legacy)) {
      await query(`INSERT INTO public.curriculum_outcome_canonical_links(outcome_id,canonical_id,taxonomy_version,package_sha256)
        VALUES($1,$2,$3,$4)`, [row.outcome_id, row.canonical_id, row.taxonomy_version, row.package_sha256])
    }
    await query('SET LOCAL ROLE service_role')
    let aliases = 0, canonical = 0
    for (const game of new Set(legacy.map(r => r.game))) {
      const result = await readCatalog(game, 'LGS', plan.taxonomyVersion)
      assert.equal(result.catalogStatus, 'complete', game)
      assert.equal(result.learnerReady, false)
      assert.equal(result.publicationAuthorized, false)
      assert.equal(JSON.stringify(result).includes('depolama bağlantısı'), false)
      aliases += result.legacyOutcomeCount
      canonical += result.canonicalOutcomeCount
    }
    assert.equal(aliases, 52)
    assert.equal(canonical, 51)
    // This is a local SQL rehearsal on invented fixture UUIDs, NOT live UUID binding or a release.
  })
})
