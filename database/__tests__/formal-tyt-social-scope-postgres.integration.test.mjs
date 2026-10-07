// Real migration on a NEW loopback-only cluster; never accepts a remote DB URL.
// Uses the same opt-in binary directory as canonical curriculum acceptance.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, isAbsolute } from 'node:path'
import pg from 'pg'

const testing = process.env.VITEST ? await import('vitest') : await import('node:test')
const { describe, it } = testing
const before = testing.beforeAll ?? testing.before
const after = testing.afterAll ?? testing.after
const sql = readFileSync(new URL('../migrations/221_formal_tyt_social_scope.sql', import.meta.url), 'utf8')
const old = readFileSync(new URL('../migrations/205_tyt_social_candidate_policy_foundation.sql', import.meta.url), 'utf8')
const start = old.indexOf('CREATE OR REPLACE FUNCTION public.tyt_social_exam_role_compatible(')
const priorFunction = old.slice(start, old.indexOf('$fn$;', start) + 5)
assert.ok(start > 0)
const bin = process.env.CANONICAL_PG_BIN
if (bin) assert.ok(isAbsolute(bin))
const run = (name, args) => execFileSync(join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args,
  { windowsHide: true, encoding: 'utf8', timeout: 60000, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' })

;(bin ? describe : describe.skip)('formal TYT scope: narrow real PostgreSQL fixture', () => {
  let db, data, cluster, started = false
  before(async () => {
    cluster = mkdtempSync(join(tmpdir(), 'bilge-formal-tyt-pg-'))
    data = join(cluster, 'data')
    run('initdb', ['-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--no-locale', '-E', 'UTF8'])
    const port = await new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(err => err ? reject(err) : resolve(port)) })
    })
    started = true
    run('pg_ctl', ['-D', data, '-l', join(cluster, 'postgres.log'), '-w', '-t', '30',
      '-o', `-F -h 127.0.0.1 -p ${port} -c unix_socket_directories=`, 'start'])
    db = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', connectionTimeoutMillis: 5000 })
    await db.connect()
    assert.equal(realpathSync((await db.query('SHOW data_directory')).rows[0].data_directory).toLowerCase(), realpathSync(data).toLowerCase())
    await db.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE TABLE public.curriculum_scope_releases(game text,display_exam_ref text,release_status text);
      INSERT INTO public.curriculum_scope_releases VALUES ('sosyal','TYT','validating');
      CREATE TABLE public.question_content_revisions(id uuid PRIMARY KEY,category text);
      CREATE TABLE public.question_revision_exam_roles(revision_id uuid REFERENCES public.question_content_revisions);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,content jsonb);
      INSERT INTO public.questions VALUES(gen_random_uuid(),' {"unchanged":true} ');
      CREATE FUNCTION public.start_social_discovery_pilot(uuid,uuid,uuid,uuid) RETURNS jsonb
        LANGUAGE sql AS 'SELECT ''{"historical":true}''::jsonb';
      GRANT EXECUTE ON FUNCTION public.start_social_discovery_pilot(uuid,uuid,uuid,uuid) TO service_role;`)
    await db.query(priorFunction)
  })
  after(async () => {
    try { if (db) await db.end() } finally {
      if (started) {
        let running = false
        try { run('pg_ctl', ['-D', data, 'status']); running = true } catch (error) { if (error.status !== 3) throw error }
        if (running) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
      }
      if (cluster) console.log(`Own cluster stopped; evidence retained: ${cluster}`)
    }
  })
  it('reproduces the old sociology allowance then applies idempotently without changing data or the separate pilot', async () => {
    const before = (await db.query('SELECT jsonb_agg(q) AS rows FROM public.questions q')).rows
    assert.equal((await db.query("SELECT public.tyt_social_exam_role_compatible('sosyoloji','common_philosophy') AS ok")).rows[0].ok, true)
    await db.query(sql)
    await db.query(sql)
    assert.deepEqual((await db.query('SELECT jsonb_agg(q) AS rows FROM public.questions q')).rows, before)
    assert.equal((await db.query("SELECT release_status FROM public.curriculum_scope_releases")).rows[0].release_status, 'validating')
    assert.equal((await db.query("SELECT has_function_privilege('service_role','public.start_social_discovery_pilot(uuid,uuid,uuid,uuid)','EXECUTE') AS ok")).rows[0].ok, true)
  })
  it('admits exactly five role-category pairs and rejects NULL, sociology and wrong categories', async () => {
    const roles = ['common_history','common_geography','common_philosophy','standard_religion','alternate_philosophy']
    const categories = ['tarih','cografya','felsefe','din_kulturu','felsefe']
    for (const [index, role] of roles.entries()) {
      for (const category of ['tarih','cografya','felsefe','din_kulturu','sosyoloji',null]) {
        const result = await db.query('SELECT public.tyt_social_exam_role_compatible($1,$2) AS ok', [category, role])
        assert.equal(result.rows[0].ok, category === categories[index], `${role}/${category}`)
      }
    }
    assert.equal((await db.query("SELECT public.tyt_social_exam_role_compatible('felsefe',NULL) AS ok")).rows[0].ok, false)
  })
  it('keeps role predicate internal', async () => {
    for (const role of ['anon','authenticated','service_role']) {
      const row = (await db.query("SELECT has_function_privilege($1,'public.tyt_social_exam_role_compatible(text,text)','EXECUTE') AS ok", [role])).rows[0]
      assert.equal(row.ok, false)
    }
  })
  it('refuses a previously released scope instead of silently changing it', async () => {
    await db.query("UPDATE public.curriculum_scope_releases SET release_status='released'")
    await assert.rejects(db.query(sql), error => error.code === '55000')
    await db.query('ROLLBACK')
    await db.query("UPDATE public.curriculum_scope_releases SET release_status='validating'")
  })
  it('refuses existing sociology role assignments and preserves them', async () => {
    await db.query("INSERT INTO public.question_content_revisions VALUES('10000000-0000-4000-8000-000000000001','sosyoloji'); INSERT INTO public.question_revision_exam_roles SELECT id FROM public.question_content_revisions")
    await assert.rejects(db.query(sql), error => error.code === '55000')
    await db.query('ROLLBACK')
    assert.equal((await db.query('SELECT count(*) FROM public.question_revision_exam_roles')).rows[0].count, '1')
  })
})
