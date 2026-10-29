// Migration 230 kucuk metin duzeltmesi: gercek PostgreSQL davranis testi.
// Yerelde izole PGlite (WASM), CI'da SOURCE_REVIEW_PG_BIN ile yerli PostgreSQL 16.
// Fikstur: 106/136/142 tablolari ve yazma baglami, fen/turkce/229 politika
// cozucusu ve yayin tetikleyicisi, 215 katlama fonksiyonu, ardindan 230.
// RBAC bir fikstur dikisidir (test_permissions); asil yetki 106'nin isidir.
// npm install --prefix secure/sql-test-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startSourceReviewPostgres } from './helpers/isolated-source-review-postgres.mjs'
import { SUPABASE_DEFAULT_PRIVILEGES_SQL } from './supabase-default-privileges.mjs'
import { verifyMinorTextCorrection } from '../scan-question-text-defects.mjs'

const bin = process.env.SOURCE_REVIEW_PG_BIN
if (process.env.SOURCE_REVIEW_PG_REQUIRED === '1' && !bin) throw new Error('SOURCE_REVIEW_PG_BIN is required; native acceptance may not skip')
const runtime = resolve(process.env.PGLITE_RUNTIME_PATH ?? 'secure/sql-test-runtime/node_modules/@electric-sql/pglite/dist')
const suite = bin || existsSync(resolve(runtime, 'index.js')) ? describe : describe.skip
const read = (name) => readFileSync(resolve('database/migrations', name), 'utf8')
function func(file, name) {
  const text = read(file)
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  if (start < 0) throw new Error(`Missing function ${name}`)
  const tail = text.slice(start)
  const tag = tail.match(/AS (\$[a-z_]*\$)/i)[1]
  return tail.slice(0, tail.indexOf(tag, tail.indexOf(tag) + tag.length) + tag.length) + ';'
}
function table(file, name) {
  const text = read(file)
  const start = text.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`)
  if (start < 0) throw new Error(`Missing table ${name}`)
  return text.slice(start, text.indexOf('\n);', start) + 3)
}

const POLICY = 'question-quality@2'
const PUBLISH = 'public.publish_question_minor_text_correction($1,$2,$3,$4::jsonb,$5)'
const NOT_MINOR = /not a verified minor text correction/
const NOT_LEGACY = /non-current or non-approved quality decision/

// ASCII'lesmis, kesme isareti eksik taban icerik.
const baseContent = () => ({
  question: 'Asagidakilerden hangisi Ronesansin en buyuk sonuclarindan biridir?',
  options: ['Yalniz I', 'Sicaklik artar', 'Ankara', 'I ve II', 'Matbaanin yayginlasmasi'],
  answer: 4,
  solution: 'Üç etken vardır; x - 3 = 5 ise x = 8.',
})
// Mesru duzeltme: Turkce harf geri yuklemesi + kesme isareti + virgul.
const fixedContent = () => ({
  ...baseContent(),
  question: "Aşağıdakilerden hangisi, Rönesans'ın en büyük sonuçlarından biridir?",
  options: ['Yalnız I', 'Sıcaklık artar', 'Ankara', 'I ve II', 'Matbaanın yaygınlaşması'],
})
const withOption = (index, value) => {
  const c = fixedContent()
  c.options = c.options.map((o, i) => (i === index ? value : o))
  return c
}
// Anlami degistiren ama eski dogrulayicidan gecen duzenlemeler (disc #2977).
const meaningChanges = [
  ['Roma rakami Yalniz I -> Yalniz II', withOption(0, 'Yalnız II')],
  ['Roma rakami I -> İ', withOption(0, 'Yalnız İ')],
  ['zit fiil artar -> azalir', withOption(1, 'Sıcaklık azalır')],
  ['ek olumsuzluk artar -> artmaz', withOption(1, 'Sıcaklık artmaz')],
  ['farkli varlik Ankara -> İstanbul', withOption(2, 'İstanbul')],
  ['kokte zit en buyuk -> en kucuk', { ...fixedContent(), question: "Aşağıdakilerden hangisi, Rönesans'ın en küçük sonuçlarından biridir?" }],
  ['ters yon harf Üç -> Uc', { ...fixedContent(), solution: 'Uc etken vardır; x - 3 = 5 ise x = 8.' }],
  ['eksi isareti silme', { ...fixedContent(), solution: 'Üç etken vardır; x 3 = 5 ise x = 8.' }],
  ['cevap anahtari', { ...fixedContent(), answer: 3 }],
]

suite(`230 minor text correction ${bin ? 'native PostgreSQL' : 'PGlite WASM'} acceptance (isolated fixture)`, () => {
  let db, q, base, owner
  const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0].result
  const call = async (sql, values = [], role = null) => {
    await db.exec('SAVEPOINT call')
    try {
      if (role) await db.exec(`SET ROLE ${role}`)
      const value = await scalar(sql, values)
      if (role) await db.exec('RESET ROLE')
      await db.exec('RELEASE SAVEPOINT call')
      return value
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT call; RESET ROLE; RELEASE SAVEPOINT call')
      throw error
    }
  }
  const publish = (content, request = randomUUID(), question = q, baseRevision = base) =>
    call(`SELECT ${PUBLISH} AS result`, [owner, question, baseRevision, JSON.stringify(content), request], 'service_role')
  const rejects = async (promise, pattern) => {
    let caught
    try { await promise } catch (error) { caught = error }
    expect(caught?.code).toBe('22023')
    expect(caught?.message).toMatch(pattern)
  }
  const live = () => db.query('SELECT content, published_revision_id FROM public.questions WHERE id=$1', [q]).then((r) => r.rows[0])
  const revisionCount = () => scalar('SELECT count(*)::int AS result FROM public.question_content_revisions WHERE question_id=$1', [q])
  const decide = (verdict, policy = POLICY, revision = base) => db.query(
    `INSERT INTO public.question_validation_decisions(question_id,revision_id,content_sha256,policy_version,verdict,findings,rationale,run_id,decided_at)
     SELECT question_id,id,content_sha256,$2,$3,'[]'::jsonb,'fixture decision',gen_random_uuid(),clock_timestamp()
     FROM public.question_content_revisions WHERE id=$1`, [revision, policy, verdict])

  async function seedQuestion({ game = 'sosyal', category = 'tarih', subcategory = null, topic = null, exam = 'TYT', content = baseContent() } = {}) {
    const question = randomUUID(); const revision = randomUUID(); const outcome = randomUUID()
    await db.query(`INSERT INTO public.questions(id,content,game,category,subcategory,topic,difficulty,exam_ref,is_boss,is_active,published_revision_id)
      VALUES($1,$2,$3,$4,$5,$6,2,$7,false,true,$8)`, [question, JSON.stringify(content), game, category, subcategory, topic, exam, revision])
    await db.query(`INSERT INTO public.question_content_revisions(id,question_id,revision_no,game,category,subcategory,topic,difficulty,exam_ref,content,content_sha256,change_kind,change_summary,status,prepared_by,published_at)
      VALUES($1,$2,1,$3,$4,$5,$6,2,$7,$8::jsonb,encode(extensions.digest($8::jsonb::text,'sha256'),'hex'),'edit','Synthetic base','published',$9,clock_timestamp())`,
    [revision, question, game, category, subcategory, topic, exam, JSON.stringify(content), owner])
    await db.query("INSERT INTO public.question_revision_sources(revision_id,source_kind,source_title,license_code,provenance_ref) VALUES($1,'original','Synthetic','INTERNAL','original:fixture')", [revision])
    await db.query("INSERT INTO public.curriculum_outcomes(id,game,category,exam_ref,taxonomy_version) VALUES($1,$2,$3,$4,'fixture-v1')", [outcome, game, category, exam])
    await db.query('INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary) VALUES($1,$2,1,true)', [revision, outcome])
    return { question, revision }
  }

  beforeAll(async () => {
    if (bin) db = await startSourceReviewPostgres(bin)
    else {
      const { PGlite } = await import(pathToFileURL(resolve(runtime, 'index.js')).href)
      const { pgcrypto } = await import(pathToFileURL(resolve(runtime, 'contrib/pgcrypto.js')).href)
      const lite = new PGlite({ extensions: { pgcrypto } })
      // PGlite query() tek komutluk hazir ifade ister; parametresiz cok komutlu
      // metin (varsayilan yetkiler) yerli istemcideki gibi basit protokolle kosar.
      db = {
        query: (sql, values = []) => (values.length || !/;\s*\S/.test(sql) ? lite.query(sql, values) : lite.exec(sql).then((r) => r.at(-1))),
        exec: (sql) => lite.exec(sql),
        close: () => lite.close(),
      }
    }
    await db.exec(`CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.questions(id uuid PRIMARY KEY,content jsonb,game text,category text,subcategory text,topic text,difficulty smallint,level_tag text,exam_ref text,is_boss boolean,is_active boolean,published_revision_id uuid);
      CREATE TABLE public.curriculum_nodes(id uuid PRIMARY KEY,parent_id uuid,node_type text,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true);
      CREATE TABLE public.curriculum_outcomes(id uuid PRIMARY KEY,node_id uuid,game text,category text,exam_ref text,taxonomy_version text,is_active boolean DEFAULT true);
      CREATE TABLE public.curriculum_outcome_canonical_links(outcome_id uuid PRIMARY KEY,canonical_id text);
      CREATE TABLE public.curriculum_scope_releases(game text,display_exam_ref text,question_exam_ref text,release_status text,taxonomy_version text,mapping_mode text);
      CREATE TABLE public.question_outcomes(question_id uuid,outcome_id uuid,weight numeric,is_primary boolean,mapping_source text DEFAULT 'manual',PRIMARY KEY(question_id,outcome_id));
      CREATE TABLE public.test_permissions(allowed boolean); INSERT INTO public.test_permissions VALUES(true);
      CREATE FUNCTION public.content_governance_has_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT allowed FROM public.test_permissions$$;
      CREATE TABLE public.question_validation_runtime(singleton boolean PRIMARY KEY,required_policy_version text,enforce_publish_gate boolean DEFAULT true);
      INSERT INTO public.question_validation_runtime(singleton,required_policy_version) VALUES(true,'${POLICY}');
      CREATE TABLE public.question_validation_runs(run_id uuid,question_id uuid,revision_id uuid,content_sha256 text,agent text,sample_index int,provider_id text,model_id text,prompt_version text,policy_version text,generation_config jsonb,generation_config_sha256 text,input_snapshot jsonb,status text,error_kind text,skip_reason text,raw_output text,parsed_output jsonb);
      CREATE FUNCTION public.question_revision_single_review_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
      CREATE FUNCTION public.resolve_question_curriculum_validation_scope(text,text) RETURNS TABLE(taxonomy_version text,release_status text) LANGUAGE sql STABLE AS $$SELECT NULL::text,NULL::text$$;
      CREATE FUNCTION public.question_active_outcome_mapping_valid(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;`)
    for (const name of ['content_governance_runtime', 'content_governance_requests', 'question_content_revisions', 'question_revision_outcomes', 'question_revision_sources', 'question_revision_approvals', 'question_governance_events']) await db.exec(table('106_question_content_governance.sql', name))
    await db.exec('ALTER TABLE public.question_content_revisions ADD COLUMN outcomes_prepared_by uuid; INSERT INTO public.content_governance_runtime(singleton,enforce_direct_mutation) VALUES(true,true)')
    // Gercek karar tablosu (findings/rationale/decided_at ve UNIQUE kisitiyla); uuid-ossp yerine core uuid.
    await db.exec(table('136_question_validation_pipeline.sql', 'question_validation_decisions').replace('uuid_generate_v4()', 'gen_random_uuid()'))
    await db.exec(table('142_question_governance_write_context.sql', 'content_governance_write_context'))
    await db.exec('ALTER TABLE public.content_governance_write_context ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.content_governance_write_context FROM PUBLIC,anon,authenticated,service_role')
    for (const [file, names] of [
      ['106_question_content_governance.sql', ['content_governance_hash', 'content_governance_lock_request']],
      ['142_question_governance_write_context.sql', ['content_governance_authorize_question_write', 'content_governance_clear_question_write', 'tg_question_content_direct_mutation_guard']],
      ['164_question_revision_outcome_scope.sql', ['curriculum_outcome_scope_valid', 'question_revision_outcomes_valid', 'lock_question_revision_outcome_scope']],
      ['217_question_source_review_single_approval.sql', ['publish_question_content_revision']],
      ['215_question_turkish_letter_restoration.sql', ['question_turkish_restoration_fold']],
    ]) for (const name of names) await db.exec(func(file, name))
    await db.exec(`REVOKE ALL ON FUNCTION public.content_governance_authorize_question_write(uuid,text),public.content_governance_clear_question_write(uuid) FROM PUBLIC,anon,authenticated,service_role;
      CREATE TRIGGER direct_guard BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.tg_question_content_direct_mutation_guard();
      CREATE TABLE public.question_revision_source_reviews(id uuid DEFAULT gen_random_uuid(),revision_id uuid,reviewer_id uuid,reviewed_at timestamptz,content_sha256 text,evidence_fingerprint text,report jsonb,report_sha256 text);
      CREATE FUNCTION public.question_source_review_actor_valid(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
      CREATE FUNCTION public.question_source_review_fingerprint(uuid) RETURNS text LANGUAGE sql STABLE AS $$SELECT repeat('a',64)$$;
      CREATE FUNCTION public.question_source_report_valid(uuid,jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;`)
    await db.exec(func('136_question_validation_pipeline.sql', 'tg_require_question_validation_decision'))
    await db.exec('CREATE TRIGGER validation BEFORE UPDATE OF published_revision_id ON public.questions FOR EACH ROW EXECUTE FUNCTION public.tg_require_question_validation_decision()')
    // Canli zincirdeki sira: fen -> turkce -> 229 -> 230.
    for (const file of ['20261011203500_revision_bound_fen_quality_policy.sql', '20261014183929_revision_bound_turkce_quality_policy.sql']) await db.exec(read(file).replaceAll('__TARGET_EXAM__', 'LGS'))
    await db.exec(read('229_revision_bound_tyt_quality_policy.sql'))
    // Supabase varsayilan yetkileri yalniz test edilen migration'in nesnelerine uygulanir.
    await db.query(SUPABASE_DEFAULT_PRIVILEGES_SQL)
    const migration = read('230_question_minor_text_correction.sql')
    await db.exec(migration)
    await db.exec(migration) // idempotent yeniden uygulama
  }, 120_000)
  afterAll(async () => { await db?.close() })
  afterEach(async () => { await db.exec('ROLLBACK') })
  beforeEach(async () => {
    await db.exec('BEGIN') // her test geri alinir; append-only kanit silinmez
    owner = randomUUID()
    await db.query('INSERT INTO public.profiles VALUES($1)', [owner])
    ;({ question: q, revision: base } = await seedQuestion())
  })

  it('carries a current APPROVED decision and publishes a pure spelling fix', async () => {
    await decide('APPROVED')
    const out = await publish(fixedContent())
    expect(out).toMatchObject({ status: 'published', basePolicyVerdict: `APPROVED@${POLICY}`, replayed: false })
    expect(await live()).toEqual({ content: fixedContent(), published_revision_id: out.revisionId })
    expect(await scalar('SELECT status AS result FROM public.question_content_revisions WHERE id=$1', [base])).toBe('superseded')
    const carried = (await db.query(`SELECT d.verdict, d.policy_version, d.content_sha256 = r.content_sha256 AS hash_ok
      FROM public.question_validation_decisions d JOIN public.question_content_revisions r ON r.id = d.revision_id WHERE d.revision_id=$1`, [out.revisionId])).rows
    expect(carried).toEqual([{ verdict: 'APPROVED', policy_version: POLICY, hash_ok: true }])
    expect(await scalar('SELECT base_policy_verdict AS result FROM public.question_minor_text_corrections WHERE revision_id=$1', [out.revisionId])).toBe(`APPROVED@${POLICY}`)
    expect(await scalar("SELECT count(*)::int AS result FROM public.question_governance_events WHERE revision_id=$1 AND event_type='published'", [out.revisionId])).toBe(1)
  })

  it('publishes a base with no decision at all as NONE_LEGACY without a fake approval', async () => {
    const out = await publish(fixedContent())
    expect(out).toMatchObject({ status: 'published', basePolicyVerdict: 'NONE_LEGACY' })
    expect(await scalar('SELECT count(*)::int AS result FROM public.question_validation_decisions WHERE revision_id=$1', [out.revisionId])).toBe(0)
    expect((await live()).published_revision_id).toBe(out.revisionId)
  })

  it.each(meaningChanges)('rejects a meaning change: %s', async (_name, content) => {
    await decide('APPROVED')
    const before = await live()
    await rejects(publish(content), NOT_MINOR)
    expect(await live()).toEqual(before)
    expect(await revisionCount()).toBe(1)
  })

  it.each(['REJECTED', 'NEEDS_REVIEW', 'INCONCLUSIVE'])('refuses a %s base instead of laundering it as legacy', async (verdict) => {
    await decide(verdict)
    await rejects(publish(fixedContent()), NOT_LEGACY)
    expect(await revisionCount()).toBe(1)
  })

  it('refuses a base approved only under an older policy', async () => {
    await decide('APPROVED', 'question-quality@1')
    await rejects(publish(fixedContent()), NOT_LEGACY)
  })

  it('carries an approval whose hash used the 2026-08-22 compact-JSON serialization (215 parity)', async () => {
    const { createHash } = await import('node:crypto')
    const compact = createHash('sha256').update(JSON.stringify(baseContent())).digest('hex')
    expect(compact).not.toBe(await scalar('SELECT content_sha256 AS result FROM public.question_content_revisions WHERE id=$1', [base]))
    await db.query(`INSERT INTO public.question_validation_decisions(question_id,revision_id,content_sha256,policy_version,verdict,findings,rationale,run_id,decided_at)
      VALUES($1,$2,$3,$4,'APPROVED','[]','compact json hash',gen_random_uuid(),clock_timestamp())`, [q, base, compact, POLICY])
    expect(await publish(fixedContent())).toMatchObject({ status: 'published', basePolicyVerdict: `APPROVED@${POLICY}` })
  })

  it('refuses when a newer current-policy decision overrides an older approval', async () => {
    await db.query(`INSERT INTO public.question_validation_decisions(question_id,revision_id,content_sha256,policy_version,verdict,findings,rationale,run_id,decided_at)
      VALUES($1,$2,repeat('f',64),$3,'APPROVED','[]','older approval',gen_random_uuid(),clock_timestamp() - interval '1 day')`, [q, base, POLICY])
    await decide('NEEDS_REVIEW')
    await rejects(publish(fixedContent()), NOT_LEGACY)
  })

  it('refuses an LGS fen base whose @5 decision makes the resolver fail closed', async () => {
    const lgs = await seedQuestion({ game: 'fen', category: 'kuvvet', exam: 'LGS' })
    await decide('APPROVED', 'question-quality@5', lgs.revision)
    expect(await scalar('SELECT public.question_revision_validation_policy($1) AS result', [lgs.revision])).toBeNull()
    await rejects(publish(fixedContent(), randomUUID(), lgs.question, lgs.revision), /revision-bound quality policy/)
  })

  it.each([
    ['ses_bilgisi kategorisi', { game: 'turkce', category: 'ses_bilgisi' }],
    ['anlatim bozuklugu konusu', { game: 'turkce', category: 'paragraf', topic: 'Anlatım Bozukluğu' }],
    ['hece alt kategorisi', { game: 'turkce', category: 'dil_bilgisi', subcategory: 'hece_bilgisi' }],
    ['wordquest', { game: 'wordquest', category: 'vocabulary', exam: 'YDT' }],
  ])('excludes %s', async (_name, meta) => {
    const other = await seedQuestion(meta)
    await rejects(publish(fixedContent(), randomUUID(), other.question, other.revision), /spelling-topic question|use the two-stage revision path/)
  })

  it('does not let a NONE_LEGACY record unlock the trigger for a base that has a decision', async () => {
    await decide('REJECTED')
    const next = randomUUID()
    await db.query(`INSERT INTO public.question_content_revisions(id,question_id,revision_no,base_revision_id,game,category,difficulty,exam_ref,content,content_sha256,change_kind,change_summary,status,prepared_by)
      VALUES($1,$2,2,$3,'sosyal','tarih',2,'TYT',$4::jsonb,encode(extensions.digest($4::jsonb::text,'sha256'),'hex'),'edit','forged','draft',$5)`, [next, q, base, JSON.stringify(fixedContent()), owner])
    await db.query(`INSERT INTO public.question_minor_text_corrections(revision_id,question_id,base_revision_id,published_by,changes,base_policy_verdict,rule_version)
      VALUES($1,$2,$3,$4,'{}'::jsonb,'NONE_LEGACY','minor-text-correction@1')`, [next, q, base, owner])
    await db.query("SELECT public.content_governance_authorize_question_write($1,'publish')", [q])
    await rejects(call('UPDATE public.questions SET content=$2::jsonb, published_revision_id=$1 WHERE id=$3 RETURNING true AS result', [next, JSON.stringify(fixedContent()), q]),
      /current automated validation decision required/)
  })

  it('replays an identical request and rejects a changed payload under the same key', async () => {
    const request = randomUUID()
    const first = await publish(fixedContent(), request)
    expect(await publish(fixedContent(), request)).toMatchObject({ revisionId: first.revisionId, replayed: true })
    await rejects(publish({ ...fixedContent(), solution: 'Üç etken vardır; x - 3 = 5 ise, x = 8.' }, request), /payload mismatch/)
  })

  it('keeps the publisher service-role only and the helpers and audit table private', async () => {
    const row = (await db.query(`SELECT
      has_function_privilege('service_role','public.publish_question_minor_text_correction(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') AS service_rpc,
      has_function_privilege('authenticated','public.publish_question_minor_text_correction(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') AS client_rpc,
      has_function_privilege('service_role','public.question_minor_text_correction_letters_compatible(text,text)','EXECUTE') AS helper,
      has_function_privilege('service_role','public.question_minor_text_correction_verify(jsonb,jsonb)','EXECUTE') AS verifier,
      has_table_privilege('service_role','public.question_minor_text_corrections','SELECT') AS audit_read,
      has_table_privilege('authenticated','public.question_minor_text_corrections','INSERT') AS audit_write`)).rows[0]
    expect(row).toEqual({ service_rpc: true, client_rpc: false, helper: false, verifier: false, audit_read: false, audit_write: false })
  })

  it('JS draft verifier agrees with the SQL verifier on every probe', async () => {
    const probes = [
      ['mesru duzeltme', fixedContent()],
      ['yalniz buyuk harf', withOption(2, 'ANKARA')],
      ['yalniz noktalama', { ...fixedContent(), solution: 'Üç etken vardır, x - 3 = 5 ise x = 8.' }],
      ['noktasiz i bozulmasi', { ...fixedContent(), solution: 'Üç etken vardır; x - 3 = 5 ise x = 8.'.replace('vardır', 'vardir') }],
      ...meaningChanges,
    ]
    for (const [name, content] of probes) {
      const sql = await scalar('SELECT public.question_minor_text_correction_verify($1::jsonb,$2::jsonb) IS NOT NULL AS result', [JSON.stringify(baseContent()), JSON.stringify(content)])
      const js = verifyMinorTextCorrection(baseContent(), content) !== null
      expect({ name, js }).toEqual({ name, js: sql })
    }
    expect(await scalar('SELECT public.question_minor_text_correction_letters_compatible($1,$2) AS result', ['ISTANBUL', 'İSTANBUL'])).toBe(true)
    expect(await scalar('SELECT public.question_minor_text_correction_letters_compatible($1,$2) AS result', ['İstanbul', 'Istanbul'])).toBe(false)
  })
})
