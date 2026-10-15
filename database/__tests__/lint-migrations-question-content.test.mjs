import { describe, expect, it } from 'vitest'
import {
  APPROVED_QUESTION_CONTENT_MIGRATIONS,
  lintAllQuestionContent,
  lintQuestionContentSql,
  newQuestionContentViolations,
} from '../lint-migrations.mjs'

const rules = (sql) => lintQuestionContentSql(sql).map((v) => v.rule)

describe('soru icerigi migration ile degismez (yonetisim 106/142)', () => {
  it('Antigravity pilot paketi gibi soru metni duzelten UPDATE ihlaldir', () => {
    const sql = `
      -- Pilot 5 bulgulari
      UPDATE public.questions
      SET content = jsonb_set(content, '{question}', '"f(x) = x² ise f(3) kaçtır?"')
      WHERE id = '5c0d0c11-220f-4d7b-93a9-3e0f2715aeb3';
      UPDATE questions SET is_active = false WHERE id = '4f9b0869-16ff-4948-b183-1c93bb2489fb';
    `
    const v = lintQuestionContentSql(sql)
    expect(v.map((x) => [x.rule, x.line])).toEqual([['question-content-dml', 3], ['question-content-dml', 6]])
    expect(v[0].detail).toContain('content')
    expect(v[1].detail).toContain('is_active')
  })

  it('DO blogu, dinamik SQL ve dogrudan INSERT/DELETE/MERGE/TRUNCATE de ihlaldir', () => {
    expect(rules(`DO $$ BEGIN UPDATE public.questions SET content = '{}'::jsonb WHERE id = 'x'; END $$;`)).toEqual(['question-content-dml'])
    expect(rules(`DO $do$ BEGIN EXECUTE 'UPDATE questions SET is_active = true'; END $do$;`)).toEqual(['question-content-dml'])
    expect(rules(`DO LANGUAGE plpgsql $$ BEGIN EXECUTE $q$DELETE FROM questions WHERE id = 'x'$q$; END $$;`)).toEqual(['question-content-dml'])
    expect(rules(`INSERT INTO public.questions (id, content) VALUES ('x', '{}');`)).toEqual(['question-content-dml'])
    expect(rules(`DELETE FROM ONLY questions WHERE id = 'x';`)).toEqual(['question-content-dml'])
    expect(rules(`MERGE INTO questions q USING src s ON q.id = s.id WHEN MATCHED THEN UPDATE SET content = s.content;`)).toContain('question-content-dml')
    expect(rules(`TRUNCATE TABLE audit_log, public.questions;`)).toEqual(['question-content-dml'])
    expect(rules(`UPDATE public.question_content_revisions SET status = 'published' WHERE id = 'x';`)).toEqual(['question-content-dml'])
    expect(rules(`INSERT INTO question_content_revisions (id) VALUES ('x');`)).toEqual(['question-content-dml'])
  })

  it('icerik yazan fonksiyonu ayni dosyada tanimlayip cagirmak ihlaldir', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.tmp_fix_pilot() RETURNS void LANGUAGE plpgsql AS $fn$
      BEGIN UPDATE public.questions SET content = content || '{"solution":"x"}' WHERE id = 'x'; END $fn$;
      SELECT public.tmp_fix_pilot();
      DROP FUNCTION IF EXISTS public.tmp_fix_pilot();
    `
    const v = lintQuestionContentSql(sql)
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ rule: 'question-content-dml', line: 4 })
    expect(v[0].detail).toContain('tmp_fix_pilot')
    const sqlBody = `CREATE FUNCTION fix() RETURNS void LANGUAGE sql AS 'UPDATE questions SET is_active = false';\nDO $$ BEGIN PERFORM fix(); END $$;`
    expect(rules(sqlBody)).toEqual(['question-content-dml'])
  })

  it('korumayi kapatmak veya yonetisim RPC\'sini migration\'dan cagirmak ihlaldir', () => {
    expect(rules(`ALTER TABLE public.questions DISABLE TRIGGER trg_question_content_direct_mutation_guard;`)).toEqual(['question-guard-bypass'])
    expect(rules(`ALTER TABLE questions DISABLE TRIGGER ALL;`)).toEqual(['question-guard-bypass'])
    expect(rules(`SET LOCAL session_replication_role = replica;`)).toEqual(['question-guard-bypass'])
    expect(rules(`SELECT set_config('session_replication_role', 'replica', true);`)).toEqual(['question-guard-bypass'])
    expect(rules(`UPDATE public.content_governance_runtime SET enforce_direct_mutation = false WHERE singleton;`)).toEqual(['question-guard-bypass'])
    expect(rules(`SELECT public.set_content_governance_enforcement('00000000-0000-0000-0000-000000000000', false, gen_random_uuid());`)).toEqual(['question-guard-bypass'])
    expect(rules(`DO $$ BEGIN PERFORM public.publish_question_content_revision('u', 'r', 'q'); END $$;`)).toEqual(['question-guard-bypass'])
    expect(rules(`DO $$ BEGIN PERFORM public.review_question_content_revision('u', 'r', 'approve', 'q'); END $$;`)).toEqual(['question-guard-bypass'])
    expect(rules(`SELECT public.publish_question_turkish_restoration('u', 'q', 'r', '{}'::jsonb, 'x');`)).toEqual(['question-guard-bypass'])
    expect(rules(`DROP TRIGGER IF EXISTS trg_question_content_direct_mutation_guard ON public.questions;`)).toEqual(['question-guard-bypass'])
  })

  it('calismayan veya icerige dokunmayan SQL ihlal degildir', () => {
    const governanceFunction = `
      CREATE OR REPLACE FUNCTION public.publish_question_content_revision(p_user uuid, p_rev uuid, p_req uuid)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
      BEGIN UPDATE public.questions SET content = r.content, published_revision_id = r.id FROM r WHERE true; RETURN '{}'; END $fn$;
      REVOKE ALL ON FUNCTION public.create_governed_question(uuid,jsonb,uuid),
        public.publish_question_content_revision(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.publish_question_content_revision(uuid,uuid,uuid) TO service_role;
      COMMENT ON FUNCTION public.publish_question_content_revision(uuid,uuid,uuid) IS 'UPDATE questions SET content';
    `
    expect(lintQuestionContentSql(governanceFunction)).toEqual([])
    expect(rules(`
      DROP TRIGGER IF EXISTS trg_question_content_direct_mutation_guard ON public.questions;
      CREATE TRIGGER trg_question_content_direct_mutation_guard BEFORE UPDATE ON public.questions
        FOR EACH ROW EXECUTE FUNCTION public.tg_question_content_direct_mutation_guard();
    `)).toEqual([])
    expect(rules(`DO $$ BEGIN IF has_function_privilege('anon','public.publish_question_content_revision(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'open'; END IF; END $$;`)).toEqual([])
    expect(rules(`UPDATE public.questions SET times_answered = times_answered + 1 WHERE id = 'x';`)).toEqual([])
    expect(rules(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.questions FROM anon, authenticated, service_role;`)).toEqual([])
    expect(rules(`UPDATE public.user_questions SET content = '{}'; INSERT INTO questions_archive SELECT 1;`)).toEqual([])
    expect(rules(`-- UPDATE questions SET content = '{}';\n/* DELETE FROM questions; */ SELECT 1;`)).toEqual([])
    expect(rules(`CREATE POLICY p ON public.questions FOR UPDATE USING (false);`)).toEqual([])
  })

  it('mevcut migration\'larda onaylanmamis ihlal yok; onay listesi yalniz gercek ihlalleri tasir', () => {
    expect(newQuestionContentViolations()).toEqual({})
    const all = lintAllQuestionContent()
    for (const [file, counts] of Object.entries(APPROVED_QUESTION_CONTENT_MIGRATIONS)) {
      const actual = {}
      for (const v of all[file] ?? []) actual[v.rule] = (actual[v.rule] ?? 0) + 1
      expect(actual, file).toEqual(counts)
    }
  })

  it('onayli dosya listesi yeni ihlali ortmez', () => {
    const all = { '999_fix_pilot_audited_questions.sql': lintQuestionContentSql(`UPDATE questions SET content = '{}';`) }
    expect(Object.keys(newQuestionContentViolations(all))).toEqual(['999_fix_pilot_audited_questions.sql'])
  })
})
