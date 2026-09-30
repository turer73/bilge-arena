// Real PG, opt-in, loopback disposable DB only. Standalone without Vite caches:
// SOCIAL_PILOT_TEST_DATABASE_URL=postgres://postgres@localhost:55439/bilge_social_pilot_test_20260930
// SOCIAL_PILOT_TEST_DATABASE_DISPOSABLE=1 node --test <this file>
// Also compatible with the repository's Vitest database runner.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire, Module } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const testing = process.env.VITEST ? await import('vitest') : await import('node:test')
const before = testing.beforeAll ?? testing.before
const after = testing.afterAll ?? testing.after
const { describe, it } = testing
const require = createRequire(import.meta.url)
const typescript = require('typescript')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sql = readFileSync(join(root, 'database/migrations/215_social_discovery_pilot.sql'), 'utf8')
const categories = ['tarih', 'cografya', 'felsefe', 'sosyoloji']

// Load the actual TS selector/replay/parser without emitting or editing files.
// server-only is a compile-time framework marker, stubbed only in this harness.
const tsModules = new Map()
function loadTs(filename) {
  if (tsModules.has(filename)) return tsModules.get(filename).exports
  const compiled = new Module(filename)
  compiled.filename = filename
  compiled.paths = Module._nodeModulePaths(dirname(filename))
  tsModules.set(filename, compiled)
  const relativeRequire = createRequire(filename)
  compiled.require = id => {
    if (id === 'server-only') return {}
    const child = resolve(dirname(filename), `${id}.ts`)
    return id.startsWith('.') && existsSync(child) ? loadTs(child) : relativeRequire(id)
  }
  compiled._compile(typescript.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename)
  return compiled.exports
}
const { replaySocialPilotSession } = loadTs(join(root, 'src/lib/diagnostic/social-pilot-session.ts'))
const { parseSocialPilotContext, publicSocialPilotContext } = loadTs(join(root, 'src/lib/diagnostic/social-pilot-runtime.ts'))

const url = process.env.SOCIAL_PILOT_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.SOCIAL_PILOT_TEST_DATABASE_DISPOSABLE === '1')
if (url) {
  const target = new URL(url)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || !/^bilge_social_pilot_test_[a-z0-9_]+$/i.test(target.pathname.slice(1))) {
    throw new Error('non-loopback or non-disposable Social pilot database refused')
  }
}
const suite = enabled ? describe : describe.skip

suite('four-domain discovery on real disposable PostgreSQL', () => {
  let owner, left, right, packId, actor
  const fixtureTables = [
    'social_discovery_answers', 'social_discovery_sessions', 'social_discovery_pack_candidates',
    'social_discovery_packs', 'question_content_revisions', 'questions', 'profiles',
    'curriculum_scope_releases', 'user_diagnostic_outcome_state',
  ]

  async function rpc(connection, name, args) {
    const parameters = args.map((_, index) => `$${index + 1}`).join(',')
    const result = await connection.query(`SELECT public.${name}(${parameters}) AS result`, args)
    return result.rows[0].result
  }
  const context = (user, session = null) => rpc(left, 'get_social_discovery_pilot_context', [user, session])
  async function user() {
    const id = randomUUID()
    await owner.query('INSERT INTO public.profiles(id) VALUES($1)', [id])
    return id
  }
  async function makePack() {
    const id = randomUUID()
    await owner.query('INSERT INTO public.social_discovery_packs(id,version) VALUES($1,$2)', [id, `fixture-${id}`])
    for (const category of categories) {
      for (const [index, difficulty] of [1, 2, 3, 3, 4, 5].entries()) {
        const questionId = randomUUID(), revisionId = randomUUID()
        const content = { question: `Fixture ${category} ${index} ${id}?`,
          passage: 'Fixture passage.', options: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
          answer: index % 5, solution: 'PRIVATE_SOLUTION' }
        await owner.query(`INSERT INTO public.questions(id,game,exam_ref,category,difficulty,content)
          VALUES($1,'sosyal','TYT',$2,$3,$4::jsonb)`, [questionId, category, difficulty, content])
        await owner.query(`INSERT INTO public.question_content_revisions(
          id,question_id,game,exam_ref,category,difficulty,content,content_sha256,status)
          VALUES($1,$2,'sosyal','TYT',$3,$4,$5::jsonb,
            encode(extensions.digest(($5::jsonb)::text,'sha256'),'hex'),'published')`,
        [revisionId, questionId, category, difficulty, content])
        await owner.query('UPDATE public.questions SET published_revision_id=$1 WHERE id=$2', [revisionId, questionId])
        await owner.query(`INSERT INTO public.social_discovery_pack_candidates(
          pack_id,question_id,revision_id,content_sha256,category,difficulty)
          SELECT $1,question_id,id,content_sha256,category,difficulty
          FROM public.question_content_revisions WHERE id=$2`, [id, revisionId])
      }
    }
    return id
  }
  async function acceptAndRelease(id) {
    // Artificial test acceptance only. No real source approval or release.
    return owner.query(`UPDATE public.social_discovery_packs SET status='released',
      source_package_sha256=$2,accepted_by=$3,acceptance_reference='test-fixture-only',
      accepted_at=clock_timestamp() WHERE id=$1`, [id, 'a'.repeat(64), actor])
  }
  async function start(userId, sessionId = randomUUID(), connection = left) {
    const initial = await context(userId)
    const rows = initial.rows
    const first = replaySocialPilotSession({ rows, seed: sessionId, responses: [] }).nextQuestion.questionId
    return rpc(connection, 'start_social_discovery_pilot', [userId, sessionId, packId, first])
  }
  function answerArgs(userId, value, requestId = randomUUID(), selected = null) {
    const session = value.session
    const replay = replaySocialPilotSession({ rows: session.rows, seed: session.id, responses: session.responses })
    const current = replay.nextQuestion
    const row = session.rows.find(row => row.id === current.questionId)
    const selectedOption = selected ?? row.content.answer
    const next = replaySocialPilotSession({ rows: session.rows, seed: session.id,
      responses: [...session.responses, { questionId: row.id, revisionId: row.published_revision_id,
        contentSha256: row.content_sha256, selectedOptionIndex: selectedOption }] }).nextQuestion
    return [userId, session.id, row.id, selectedOption, 1200, requestId,
      session.answeredCount, next?.questionId ?? null]
  }
  const record = (args, connection = left) => rpc(connection, 'record_social_discovery_pilot_answer', args)
  const fails = (promise, code) => assert.rejects(promise, error => error.code === code)

  before(async () => {
    owner = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 })
    left = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 })
    right = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 })
    await owner.connect()
    const actual = (await owner.query('SELECT current_database() AS name')).rows[0].name
    assert.equal(actual, new URL(url).pathname.slice(1))
    const existing = (await owner.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows
    assert(existing.every(row => fixtureTables.includes(row.tablename)), 'unknown tables: disposable fixture refused')
    // Only the enumerated fixture tables in the verified dedicated local DB.
    await owner.query(`DROP TABLE IF EXISTS ${fixtureTables.map(name => `public.${name}`).join(',')} CASCADE`)
    await owner.query(`
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,game text NOT NULL,exam_ref text,
        category text NOT NULL,difficulty smallint NOT NULL,content jsonb NOT NULL,
        is_active boolean NOT NULL DEFAULT true,published_revision_id uuid);
      CREATE TABLE public.question_content_revisions(id uuid PRIMARY KEY,
        question_id uuid NOT NULL REFERENCES public.questions(id),game text NOT NULL,
        exam_ref text,category text NOT NULL,difficulty smallint NOT NULL,
        subcategory text,topic text,level_tag text,content jsonb NOT NULL,
        content_sha256 text NOT NULL,status text NOT NULL);
      CREATE TABLE public.curriculum_scope_releases(game text,question_exam_ref text,
        release_status text,diagnostic_enabled boolean, UNIQUE(game,question_exam_ref));
      INSERT INTO public.curriculum_scope_releases VALUES('sosyal','TYT','validating',false);
      CREATE TABLE public.user_diagnostic_outcome_state(user_id uuid PRIMARY KEY,score numeric);
      INSERT INTO public.user_diagnostic_outcome_state VALUES(gen_random_uuid(),77);
    `)
    await owner.query(sql)
    await left.connect(); await right.connect()
    await left.query('SET ROLE service_role'); await right.query('SET ROLE service_role')
    actor = await user()
    assert.deepEqual(await context(actor), { enabled: false, packId: null, rows: [], session: null })
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM public.social_discovery_packs')).rows[0].count, 0)
    packId = await makePack()
    await acceptAndRelease(packId)
  })
  after(async () => { await Promise.allSettled([owner?.end(), left?.end(), right?.end()]) })

  it('does not modify the whole-scope guards or introduce a quality/mastery pipeline', () => {
    assert(!/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(?:resolve_released_diagnostic_scope|require_released_adaptive_diagnostic_blueprint)/i.test(sql))
    assert(!/\b(?:INSERT\s+INTO|UPDATE|ALTER\s+TABLE)\s+public\.(?:curriculum_scope_releases|adaptive_diagnostic_blueprints|user_diagnostic_outcome_state|question_quality)/i.test(sql))
  })

  it('rejects identical trimmed options at the database gate', async () => {
    const result = await owner.query('SELECT public.social_discovery_valid_content($1::jsonb) AS valid', [
      { question: 'Fixture only?', options: ['Alpha', 'Bravo', 'Charlie', 'Delta', ' Alpha '], answer: 0 },
    ])
    assert.equal(result.rows[0].valid, false)
  })

  it('accepts the actual API parser and projects no answer key or solution', async () => {
    const id = await user()
    const prospective = parseSocialPilotContext(await context(id))
    assert.equal(prospective.rows.length, 24)
    const value = parseSocialPilotContext(await start(id))
    assert.equal(value.session.rows.length, 24)
    const publicValue = publicSocialPilotContext(value)
    assert(publicValue.session.question)
    assert(!JSON.stringify(publicValue).includes('PRIVATE_SOLUTION'))
    assert(!Object.hasOwn(publicValue.session.question, 'answer'))
  })

  it('denies client RPCs, raw table access and cross-user session access', async () => {
    const id = await user(), other = await user()
    const value = await start(id)
    await fails(context(other, value.session.id), '42501')
    await fails(record(answerArgs(other, value)), '42501')
    await fails(left.query('SELECT * FROM public.social_discovery_pack_candidates'), '42501')
    for (const role of ['anon', 'authenticated']) {
      await owner.query(`SET ROLE ${role}`)
      try {
        await fails(rpc(owner, 'get_social_discovery_pilot_context', [id, null]), '42501')
        await fails(owner.query('SELECT * FROM public.social_discovery_sessions'), '42501')
      } finally { await owner.query('RESET ROLE') }
    }
    await fails(rpc(left, 'social_discovery_pilot_rows', [packId]), '42501')
  })

  it('requires separate acceptance metadata and every one of the 24 quotas', async () => {
    const draft = await makePack()
    await fails(owner.query("UPDATE public.social_discovery_packs SET status='released' WHERE id=$1", [draft]), '23514')
    await owner.query(`DELETE FROM public.social_discovery_pack_candidates WHERE pack_id=$1
      AND question_id=(SELECT question_id FROM public.social_discovery_pack_candidates WHERE pack_id=$1 LIMIT 1)`, [draft])
    await fails(acceptAndRelease(draft), '23514')
    assert.equal((await owner.query('SELECT status FROM public.social_discovery_packs WHERE id=$1', [draft])).rows[0].status, 'draft')
  })

  it('rejects a forged hash, stale publication and incorrect manifest before release', async () => {
    const draft = await makePack()
    const candidate = (await owner.query('SELECT * FROM public.social_discovery_pack_candidates WHERE pack_id=$1 LIMIT 1', [draft])).rows[0]
    await fails(owner.query('UPDATE public.social_discovery_pack_candidates SET content_sha256=$2 WHERE pack_id=$1', [draft, 'f'.repeat(64)]), '23514')
    await owner.query('UPDATE public.questions SET is_active=false WHERE id=$1', [candidate.question_id])
    try { await fails(acceptAndRelease(draft), '23514') }
    finally { await owner.query('UPDATE public.questions SET is_active=true WHERE id=$1', [candidate.question_id]) }
    await owner.query("UPDATE public.question_content_revisions SET status='superseded' WHERE id=$1", [candidate.revision_id])
    try { await fails(acceptAndRelease(draft), '23514') }
    finally { await owner.query("UPDATE public.question_content_revisions SET status='published' WHERE id=$1", [candidate.revision_id]) }
    await owner.query('UPDATE public.social_discovery_packs SET manifest_sha256=$2 WHERE id=$1', [draft, 'f'.repeat(64)])
    await fails(acceptAndRelease(draft), '23514')
  })

  it('serializes simultaneous starts and resumes the original seed/snapshot', async () => {
    const id = await user(), firstId = randomUUID(), secondId = randomUUID()
    const rows = (await context(id)).rows
    const args = sessionId => [id, sessionId, packId,
      replaySocialPilotSession({ rows, seed: sessionId, responses: [] }).nextQuestion.questionId]
    const [first, second] = await Promise.all([
      rpc(left, 'start_social_discovery_pilot', args(firstId)),
      rpc(right, 'start_social_discovery_pilot', args(secondId)),
    ])
    assert.equal(first.session.id, second.session.id)
    assert.deepEqual(first.session.rows, second.session.rows)
    parseSocialPilotContext(first); parseSocialPilotContext(second)
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM public.social_discovery_sessions WHERE user_id=$1', [id])).rows[0].count, 1)
  })

  it('commits concurrent identical retries once and rejects changed client payloads', async () => {
    const id = await user(), value = await start(id), args = answerArgs(id, value)
    const [first, second] = await Promise.all([record(args), record(args, right)])
    assert.deepEqual(first, second)
    assert.equal(first.session.answeredCount, 1)
    const later = [...args]; later[6] = 1; later[7] = randomUUID()
    assert.deepEqual(await record(later), first)
    for (const index of [2, 3, 4]) {
      const changed = [...args]
      changed[index] = index === 2 ? randomUUID() : index === 3 ? (args[3] + 1) % 5 : args[4] + 1
      await fails(record(changed), '55000')
    }
    const differentRequest = [...args]; differentRequest[5] = randomUUID()
    await fails(record(differentRequest), '40001')
  })

  it('permits only one CAS commit for competing requests at the same progress', async () => {
    const id = await user(), value = await start(id)
    const a = answerArgs(id, value), b = [...a]; b[5] = randomUUID(); b[3] = (a[3] + 1) % 5
    const results = await Promise.allSettled([record(a), record(b, right)])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(results.find(result => result.status === 'rejected').reason.code, '40001')
    assert.equal((await context(id, value.session.id)).session.answeredCount, 1)
  })

  it('rejects stale progress, premature completion, foreign candidates and repeated domains atomically', async () => {
    const id = await user(), value = await start(id), args = answerArgs(id, value)
    const stale = [...args]; stale[6] = 1
    await fails(record(stale), '40001')
    const early = [...args]; early[7] = null
    await fails(record(early), '22023')
    const outside = [...args]; outside[7] = randomUUID()
    await fails(record(outside), '22023')
    const repeated = [...args]; repeated[7] = value.session.rows.find(row => row.category === 'tarih' && row.id !== args[2]).id
    await fails(record(repeated), '23514')
    assert.equal((await context(id, value.session.id)).session.answeredCount, 0)
    const invalid = [...args]; invalid[3] = 5
    await fails(record(invalid), '22023')
  })

  it('keeps all 24 pins immutable and permits old snapshots after supersession', async () => {
    const id = await user(), value = await start(id), row = value.session.rows.find(row => row.id === value.session.currentQuestionId)
    await fails(owner.query('UPDATE public.social_discovery_pack_candidates SET difficulty=1 WHERE pack_id=$1 AND question_id=$2', [packId, row.id]), '42501')
    await fails(owner.query('UPDATE public.social_discovery_packs SET source_package_sha256=$2 WHERE id=$1', [packId, 'b'.repeat(64)]), '42501')
    await fails(owner.query("UPDATE public.social_discovery_sessions SET expires_at=expires_at+interval '1 day' WHERE id=$1", [value.session.id]), '42501')
    const newer = randomUUID()
    await owner.query(`INSERT INTO public.question_content_revisions
      SELECT $1,question_id,game,exam_ref,category,difficulty,subcategory,topic,level_tag,
        content,content_sha256,'published' FROM public.question_content_revisions WHERE id=$2`, [newer, row.published_revision_id])
    await owner.query("UPDATE public.question_content_revisions SET status='superseded' WHERE id=$1", [row.published_revision_id])
    await owner.query('UPDATE public.questions SET published_revision_id=$1 WHERE id=$2', [newer, row.id])
    try {
      assert.deepEqual((await context(id, value.session.id)).session.rows, value.session.rows)
      await fails(start(await user()), '23514')
      parseSocialPilotContext(await record(answerArgs(id, value)))
    } finally {
      await owner.query('UPDATE public.questions SET published_revision_id=$1 WHERE id=$2', [row.published_revision_id, row.id])
      await owner.query("UPDATE public.question_content_revisions SET status='published' WHERE id=$1", [row.published_revision_id])
    }
  })

  it('expires without grading and starts a fresh session without changing the old pins', async () => {
    const id = await user(), initial = await context(id), sessionId = randomUUID()
    const first = replaySocialPilotSession({ rows: initial.rows, seed: sessionId, responses: [] }).nextQuestion.questionId
    await owner.query(`INSERT INTO public.social_discovery_sessions(
      id,user_id,pack_id,current_question_id,issued_at,started_at,expires_at)
      VALUES($1,$2,$3,$4,clock_timestamp()-interval '2 hours',
        clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')`, [sessionId, id, packId, first])
    const expired = await context(id, sessionId)
    assert.equal(parseSocialPilotContext(expired).session.status, 'expired')
    assert.deepEqual(await context(id), expired)
    const result = await record(answerArgs(id, expired))
    assert.equal(parseSocialPilotContext(result).session.status, 'abandoned')
    assert.equal(result.session.responses.length, 0)
    const fresh = await start(id)
    assert.notEqual(fresh.session.id, sessionId)
    assert.deepEqual(fresh.session.rows, expired.session.rows)
  })

  it('returns current progress when an old request replays after later answers', async () => {
    const id = await user(), initial = await start(id), firstArgs = answerArgs(id, initial)
    const first = await record(firstArgs)
    const current = await record(answerArgs(id, first))
    const replayArgs = [...firstArgs]; replayArgs[6] = 2; replayArgs[7] = current.session.currentQuestionId
    assert.deepEqual(await record(replayArgs), current)
    assert.equal((await context(id)).session.answeredCount, 2)
  })

  it('serializes grading against quarantine and blocks inactive next-question issuance', async () => {
    const id = await user(), initial = await start(id), args = answerArgs(id, initial)
    await owner.query('BEGIN')
    await owner.query('UPDATE public.questions SET is_active=false WHERE id=$1', [args[2]])
    const pending = record(args).then(value => ({ value }), error => ({ error }))
    let waited = false
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const activity = await owner.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [left.processID])
        if (activity.rows[0]?.wait_event_type === 'Lock') { waited = true; break }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    } finally { await owner.query('COMMIT') }
    const result = await pending
    try {
      assert(waited, 'record must wait for the in-flight question quarantine lock')
      assert.equal(result.error?.code, '55000')
      const disabled = { enabled: false, packId: null, rows: [], session: null }
      assert.deepEqual(parseSocialPilotContext(await context(id, initial.session.id)), disabled)
      assert.equal((await owner.query('SELECT answered_count FROM public.social_discovery_sessions WHERE id=$1', [initial.session.id])).rows[0].answered_count, 0)
    } finally { await owner.query('UPDATE public.questions SET is_active=true WHERE id=$1', [args[2]]) }
    await owner.query('UPDATE public.questions SET is_active=false WHERE id=$1', [args[7]])
    try {
      await fails(record(args), '55000')
      assert.equal((await context(id, initial.session.id)).session.answeredCount, 0)
      await fails(start(await user()), '23514')
    } finally { await owner.query('UPDATE public.questions SET is_active=true WHERE id=$1', [args[7]]) }
    parseSocialPilotContext(await record(args))
  })

  it('completes 12 TS-selected pinned responses, produces only four observations and never writes mastery', async () => {
    const id = await user()
    let value = await start(id), firstReceipt, firstArgs
    for (let index = 0; index < 12; index++) {
      const args = answerArgs(id, value)
      value = await record(args)
      parseSocialPilotContext(value)
      assert.equal(value.session.answeredCount, index + 1)
      if (index === 0) { firstReceipt = value; firstArgs = args }
    }
    assert.equal(value.session.status, 'completed')
    assert.equal(value.session.currentQuestionId, null)
    assert.deepEqual(publicSocialPilotContext(parseSocialPilotContext(value)).session.observations,
      categories.map(category => ({ category, answered: 3, correct: 3 })))
    assert.equal(new Set(value.session.responses.map(response => response.questionId)).size, 12)
    const retry = [...firstArgs]; retry[6] = 12; retry[7] = null
    assert.deepEqual(await record(retry), value)
    assert.equal((await context(id, value.session.id)).session.answeredCount, 12)
    assert.deepEqual(await context(id), value)
    assert.deepEqual((await owner.query('SELECT score::int AS score FROM public.user_diagnostic_outcome_state')).rows, [{ score: 77 }])
    assert.deepEqual((await owner.query('SELECT release_status,diagnostic_enabled FROM public.curriculum_scope_releases')).rows,
      [{ release_status: 'validating', diagnostic_enabled: false }])
    await fails(owner.query('UPDATE public.social_discovery_answers SET selected_option=0 WHERE session_id=$1', [value.session.id]), '42501')
    await owner.query(sql)
    assert.deepEqual(await context(id, value.session.id), value)
  })

  it('retirement disables the API catalog and fresh answers without destroying snapshots', async () => {
    const id = await user(), value = await start(id), args = answerArgs(id, value)
    await owner.query("UPDATE public.social_discovery_packs SET status='retired' WHERE id=$1", [packId])
    const disabled = { enabled: false, packId: null, rows: [], session: null }
    assert.deepEqual(await context(id, value.session.id), disabled)
    assert.deepEqual(parseSocialPilotContext(await context(await user())), disabled)
    await fails(record(args), '55000')
    assert.equal((await owner.query('SELECT count(*)::int AS count FROM public.social_discovery_pack_candidates WHERE pack_id=$1', [packId])).rows[0].count, 24)
    await fails(owner.query("UPDATE public.social_discovery_packs SET status='released' WHERE id=$1", [packId]), '42501')
  })
})
