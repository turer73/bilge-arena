import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const registrySql = readFileSync(join(root, '178_curriculum_scope_release_registry.sql'), 'utf8')
const fenReleaseSql = readFileSync(join(root, '179_release_tyt_fen_mastery_scope.sql'), 'utf8')
const fenRepairSql = readFileSync(join(root, '180_backfill_released_tyt_fen_mastery_evidence.sql'), 'utf8')
const completeRepairSql = readFileSync(join(root, '181_curriculum_scope_repair_and_parent_integrity.sql'), 'utf8')
const institutionAlignmentSql = readFileSync(join(root, '182_institution_math_scope_registry_alignment.sql'), 'utf8')
const ydtEnglishReleaseSql = readFileSync(join(root, '187_release_ydt_english_mastery_scope.sql'), 'utf8')
const ydtEnglishRepairSql = readFileSync(join(root, '188_backfill_released_ydt_english_mastery_evidence.sql'), 'utf8')
const tytTurkishReleaseSql = readFileSync(join(root, '189_release_tyt_turkce_mastery_scope.sql'), 'utf8')
const tytTurkishRepairSql = readFileSync(join(root, '190_backfill_released_tyt_turkce_mastery_evidence.sql'), 'utf8')
const tytSocialReleaseSql = readFileSync(join(root, '191_release_tyt_sosyal_mastery_scope.sql'), 'utf8')
const tytSocialRepairSql = readFileSync(join(root, '192_backfill_released_tyt_sosyal_mastery_evidence.sql'), 'utf8')
const materializerDefinition = (sql) => sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.materialize_verified_attempt_mastery'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.materialize_verified_attempt_mastery'),
)
const graphIntegrityDefinition = (sql) => sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.curriculum_graph_integrity'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.curriculum_graph_integrity'),
)

describe('178-192 curriculum scope release migrations', () => {
  it('keeps the release registry private and resolves only released scopes', () => {
    expect(registrySql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_releases/)
    expect(registrySql).toMatch(/release_status IN \('draft','validating','released','retired'\)/)
    expect(registrySql).toMatch(/ALTER TABLE public\.curriculum_scope_releases ENABLE ROW LEVEL SECURITY/)
    expect(registrySql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_releases FROM PUBLIC, anon, authenticated, service_role/)
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_released_curriculum_scope[\s\S]*release_status = 'released'/)
    expect(registrySql).toMatch(/SET search_path = pg_catalog/)
    expect(registrySql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_released_curriculum_scope\(text,text\),[\s\S]*FROM PUBLIC, anon, authenticated/)
    expect(registrySql).toMatch(/GRANT EXECUTE ON FUNCTION public\.resolve_released_curriculum_scope\(text,text\),[\s\S]*TO service_role/)
  })

  it('registers draft scopes without downgrading an already released scope', () => {
    expect(registrySql).toMatch(/VALUES\s*\(\s*'matematik', 'TYT', 'TYT', 'ba-tyt-math-v1',/)
    expect(registrySql).toContain("('fen', 'TYT', 'TYT', 'ba-tyt-fen-v1', 'draft'")
    expect(registrySql).toContain("('turkce', 'TYT', 'TYT', 'ba-tyt-turkce-v1', 'draft'")
    expect(registrySql).toContain("('sosyal', 'TYT', 'TYT', 'ba-tyt-sosyal-v1', 'draft'")
    expect(registrySql).toContain("('wordquest', 'YDT', NULL, 'ba-ydt-eng-v1', 'draft'")
    expect(registrySql).toMatch(/'matematik', 'TYT', 'TYT', 'ba-tyt-math-v1',[\s\S]*ON CONFLICT \(game, display_exam_ref\) DO NOTHING/)
    const draftUpsert = registrySql.slice(registrySql.indexOf('-- Graphs exist for these scopes'))
    expect(draftUpsert).not.toMatch(/ON CONFLICT[\s\S]{0,500}release_status\s*=\s*EXCLUDED\.release_status/)
    expect(draftUpsert).toMatch(/WHERE public\.curriculum_scope_releases\.release_status IN \('draft', 'validating'\)/)
    expect(draftUpsert).toMatch(/curriculum_scope_releases\.taxonomy_version = EXCLUDED\.taxonomy_version/)
  })

  it('uses a generic, fail-closed integrity contract', () => {
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.curriculum_scope_integrity\([\s\S]*p_game text,[\s\S]*p_display_exam_ref text,[\s\S]*p_taxonomy_version text/)
    for (const field of [
      'total', 'mapped', 'unmapped', 'scopeMismatch', 'nodeOrphan',
      'outcomeOrphan', 'primaryMismatch', 'emptyOutcome',
    ]) expect(registrySql).toContain(`'${field}'`)
    expect(registrySql).toMatch(/HAVING count\(\*\) FILTER \(WHERE mapping\.is_primary\) <> 1/)
    expect(registrySql).toMatch(/NOT EXISTS \([\s\S]*FROM valid_mapping_rows AS mapping[\s\S]*mapping\.outcome_id = outcome\.id/)
    expect(registrySql).toMatch(/child\.node_type = 'outcome'[\s\S]*parent\.category IS DISTINCT FROM child\.category/)
    expect(registrySql).toMatch(/SELECT '__course_root_count__'[\s\S]*root\.node_type = 'course'[\s\S]*root\.parent_id IS NULL[\s\S]*<> 1/)
    expect(registrySql).toMatch(/child\.node_type = 'course'[\s\S]*child\.exam_ref IS DISTINCT FROM v_scope\.display_exam_ref/)
    expect(registrySql).toMatch(/FROM public\.curriculum_nodes AS node[\s\S]*LEFT JOIN public\.curriculum_outcomes AS outcome[\s\S]*GROUP BY node\.id[\s\S]*HAVING count\(outcome\.id\) <> 1/)
    expect(registrySql).toMatch(/CREATE OR REPLACE FUNCTION public\.curriculum_graph_integrity\(\)[\s\S]*scope\.game = 'matematik'[\s\S]*scope\.release_status = 'released'[\s\S]*v_scope\.taxonomy_version/)
    expect(graphIntegrityDefinition(registrySql)).toBe(graphIntegrityDefinition(completeRepairSql))
    expect(graphIntegrityDefinition(registrySql)).not.toContain("curriculum_scope_integrity('matematik', 'TYT', 'ba-tyt-math-v1')")
    expect(registrySql).toMatch(/TYT Mathematics curriculum scope failed registry integrity/)
    expect(registrySql).toMatch(/taxonomy_version = 'ba-tyt-math-v1'[\s\S]*release_status = 'released'[\s\S]*curriculum_scope_integrity\('matematik', 'TYT', 'ba-tyt-math-v1'\)[\s\S]*v_integrity->>'primaryMismatch'[\s\S]*v_integrity->>'emptyOutcome'/)
    expect(registrySql).toMatch(/REVOKE ALL ON FUNCTION public\.curriculum_graph_integrity\(\) FROM PUBLIC, anon, authenticated/)
  })

  it('maps only validating or released scopes and preserves manual ownership', () => {
    expect(registrySql).toContain('min(outcome.id::text)::uuid')
    expect(registrySql).not.toContain('min(outcome.id),')
    expect(registrySql).toMatch(/DELETE FROM public\.question_outcomes[\s\S]*mapping_source = 'taxonomy_auto'/)
    expect(registrySql).toMatch(/release_status IN \('validating', 'released'\)/)
    expect(registrySql).toMatch(/NOT EXISTS \([\s\S]*existing\.question_id = p_question_id AND existing\.is_primary/)
    expect(registrySql).toMatch(/ON CONFLICT \(question_id, outcome_id\) DO NOTHING/)
    expect(registrySql).toMatch(/REVOKE ALL ON FUNCTION public\.sync_taxonomy_auto_question_outcomes\(uuid,text,text,text,boolean\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
  })

  it('releases TYT Fen only after every integrity field is clean', () => {
    expect(fenReleaseSql).toMatch(/LOCK TABLE[\s\S]*public\.curriculum_scope_releases,[\s\S]*public\.session_answers,[\s\S]*public\.questions,[\s\S]*public\.question_outcomes,[\s\S]*public\.verified_attempts[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
    expect(fenReleaseSql).toMatch(/CREATE TEMP TABLE fen_scope_release_control[\s\S]*release_status IN \('draft', 'validating', 'released'\)/)
    expect(fenReleaseSql).toMatch(/IF NOT \(SELECT should_apply FROM fen_scope_release_control\) THEN[\s\S]*RETURN/)
    expect(fenReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.materialize_verified_attempt_mastery[\s\S]*mapping\.mapping_source = 'taxonomy_auto'[\s\S]*GREATEST\(mapping\.created_at, scope\.released_at\)/)
    expect(fenReleaseSql).toMatch(/LEFT JOIN public\.verified_attempt_question_revisions AS snapshot[\s\S]*snapshot\.attempt_id = p_attempt_id/)
    expect(materializerDefinition(fenReleaseSql)).toBe(materializerDefinition(completeRepairSql))
    expect(fenReleaseSql).toMatch(/release_status = CASE WHEN release_status = 'released' THEN 'released' ELSE 'validating' END/)
    expect(fenReleaseSql).toMatch(/WHERE game = 'fen'[\s\S]*display_exam_ref = 'TYT'[\s\S]*taxonomy_version = 'ba-tyt-fen-v1'/)
    expect(fenReleaseSql).toMatch(/FOR v_question IN[\s\S]*FROM public\.questions[\s\S]*WHERE game = 'fen'[\s\S]*is_active/)
    expect(fenReleaseSql).toMatch(/curriculum_scope_integrity\('fen', 'TYT', 'ba-tyt-fen-v1'\)/)
    for (const field of [
      'unmapped', 'scopeMismatch', 'nodeOrphan', 'outcomeOrphan',
      'primaryMismatch', 'emptyOutcome',
    ]) expect(fenReleaseSql).toMatch(new RegExp(`v_integrity->>'${field}'`))
    expect(fenReleaseSql).toMatch(/COALESCE\(\(v_integrity->>'total'\)::integer, 0\) <= 0/)
    expect(fenReleaseSql).toMatch(/SET release_status = 'released'[\s\S]*resolve_released_curriculum_scope\('fen', 'TYT'\)/)
  })

  it('repairs only missing historical verified Fen evidence with a private replay ledger', () => {
    expect(fenRepairSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_evidence_repairs/)
    expect(fenRepairSql).toMatch(/ALTER TABLE public\.curriculum_scope_evidence_repairs ENABLE ROW LEVEL SECURITY/)
    expect(fenRepairSql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_evidence_repairs[\s\S]*PUBLIC, anon, authenticated, service_role/)
    expect(fenRepairSql).toMatch(/release_status = 'released'[\s\S]*curriculum_scope_integrity\('fen', 'TYT', 'ba-tyt-fen-v1'\)/)
    expect(fenRepairSql).toMatch(/LOCK TABLE[\s\S]*public\.session_answers,[\s\S]*public\.questions,[\s\S]*public\.question_outcomes,[\s\S]*public\.verified_attempts,[\s\S]*public\.verified_attempt_question_revisions,[\s\S]*public\.review_logs,[\s\S]*public\.review_error_annotations,[\s\S]*public\.user_outcome_state[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
    expect(fenRepairSql).toMatch(/attempt\.game = 'fen'/)
    expect(fenRepairSql).toMatch(/mapping\.mapping_source = 'taxonomy_auto'/)
    expect(fenRepairSql).toMatch(/mapping\.created_at > answer\.answered_at/)
    expect(fenRepairSql).toMatch(/LEFT JOIN public\.mastery_outcome_evidence AS existing[\s\S]*existing\.answer_id IS NULL/)
    expect(fenRepairSql).toMatch(/LEFT JOIN public\.verified_attempt_question_revisions AS snapshot[\s\S]*snapshot\.attempt_id = attempt\.id[\s\S]*snapshot\.question_id = answer\.question_id/)
    expect(fenRepairSql).toMatch(/COALESCE\(snapshot\.difficulty, question\.difficulty\)/)
    expect(fenRepairSql).toMatch(/JOIN public\.curriculum_scope_releases AS release[\s\S]*release\.release_status = 'released'/)
    expect(fenRepairSql).toMatch(/IF NOT v_scope_released THEN[\s\S]*obsolete TYT Fen v1 legacy repair mutated rows/)
    expect(fenRepairSql).toMatch(/ON CONFLICT \(answer_id, outcome_id\) DO NOTHING/)
    expect(fenRepairSql).toMatch(/ON CONFLICT \(user_id, outcome_id\) DO UPDATE SET/)
    expect(fenRepairSql).toMatch(/v_candidates <> v_inserted[\s\S]*TYT Fen evidence repair lost rows/)
  })

  it('repairs all missing primary Fen evidence and hardens parent-category integrity', () => {
    expect(completeRepairSql).toMatch(/LOCK TABLE[\s\S]*public\.session_answers,[\s\S]*public\.questions,[\s\S]*public\.question_outcomes,[\s\S]*public\.verified_attempts,[\s\S]*public\.verified_attempt_hint_events,[\s\S]*public\.review_logs,[\s\S]*public\.review_error_annotations,[\s\S]*public\.mastery_materialized_attempts,[\s\S]*public\.user_outcome_state[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
    expect(completeRepairSql).toMatch(/CREATE OR REPLACE FUNCTION public\.materialize_verified_attempt_mastery[\s\S]*mapping\.mapping_source = 'taxonomy_auto'[\s\S]*GREATEST\(mapping\.created_at, scope\.released_at\)/)
    expect(completeRepairSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_evidence_repair_runs/)
    expect(completeRepairSql).toMatch(/run_id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/)
    expect(completeRepairSql).toMatch(/repair_key text NOT NULL/)
    expect(completeRepairSql).toMatch(/ALTER TABLE public\.curriculum_scope_evidence_repair_runs ENABLE ROW LEVEL SECURITY/)
    expect(completeRepairSql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_evidence_repair_runs[\s\S]*PUBLIC, anon, authenticated, service_role/)
    expect(completeRepairSql).toMatch(/JOIN public\.mastery_materialized_attempts AS marker ON marker\.attempt_id = attempt\.id/)
    expect(completeRepairSql).toMatch(/JOIN public\.question_outcomes AS mapping[\s\S]*mapping\.is_primary/)
    const candidateSql = completeRepairSql.slice(
      completeRepairSql.indexOf('CREATE TEMP TABLE fen_scope_complete_evidence_candidates'),
      completeRepairSql.indexOf('CREATE TEMP TABLE fen_scope_complete_inserted_evidence'),
    )
    expect(candidateSql).not.toMatch(/mapping\.mapping_source\s*=\s*'taxonomy_auto'/)
    expect(candidateSql).not.toMatch(/mapping\.created_at\s*>\s*answer\.answered_at\s*\n\s*AND existing\.answer_id IS NULL/)
    expect(completeRepairSql).toMatch(/COALESCE\(snapshot\.difficulty, question\.difficulty\)/)
    expect(completeRepairSql).toMatch(/LEFT JOIN public\.verified_attempt_question_revisions AS snapshot[\s\S]*snapshot\.attempt_id = attempt\.id[\s\S]*snapshot\.question_id = answer\.question_id/)
    expect(completeRepairSql).toMatch(/NOT EXISTS \([\s\S]*mastery_outcome_evidence AS existing[\s\S]*existing\.question_id = answer\.question_id[\s\S]*existing_outcome\.taxonomy_version = 'ba-tyt-fen-v1'/)
    expect(completeRepairSql).toMatch(/question_revision_outcomes AS historical_mapping[\s\S]*historical_mapping\.revision_id = snapshot\.revision_id[\s\S]*historical_mapping\.outcome_id = existing\.outcome_id[\s\S]*historical_mapping\.is_primary/)
    expect(completeRepairSql).toMatch(/manual_mapping_rows[\s\S]*mapping_at_or_before_answer_rows[\s\S]*mapping_after_answer_rows/)
    expect(completeRepairSql).toMatch(/HAVING EXISTS \([\s\S]*taxonomy_version = 'ba-tyt-fen-v1'[\s\S]*release_status = 'released'/)
    expect(completeRepairSql).toMatch(/CREATE TEMP TABLE fen_scope_complete_repair_run[\s\S]*RETURNING \*/)
    expect(completeRepairSql).toMatch(/BEFORE INSERT OR UPDATE OF node_type, parent_id, game, exam_ref, taxonomy_version, category/)
    expect(completeRepairSql).toMatch(/WHERE id = NEW\.parent_id[\s\S]*FOR UPDATE[\s\S]*NEW\.node_type = 'outcome'[\s\S]*v_parent\.category IS DISTINCT FROM NEW\.category/)
    expect(completeRepairSql).toMatch(/child\.node_type = 'outcome'[\s\S]*parent\.category IS DISTINCT FROM child\.category/)
    expect(completeRepairSql).toMatch(/SELECT '__course_root_count__'[\s\S]*root\.node_type = 'course'[\s\S]*root\.parent_id IS NULL[\s\S]*<> 1/)
    expect(completeRepairSql).toMatch(/child\.node_type = 'course'[\s\S]*child\.exam_ref IS DISTINCT FROM v_scope\.display_exam_ref/)
    expect(completeRepairSql).toMatch(/FROM public\.curriculum_nodes AS node[\s\S]*LEFT JOIN public\.curriculum_outcomes AS outcome[\s\S]*GROUP BY node\.id[\s\S]*HAVING count\(outcome\.id\) <> 1/)
    expect(completeRepairSql).toMatch(/WHERE id = NEW\.node_id[\s\S]*FOR UPDATE[\s\S]*v_node\.category IS DISTINCT FROM NEW\.category/)
    expect(completeRepairSql).toMatch(/IF NOT v_scope_released THEN[\s\S]*obsolete TYT Fen v1 repair mutated rows/)
    expect(completeRepairSql).toMatch(/v_candidates <> v_inserted[\s\S]*TYT Fen complete evidence repair lost rows/)
  })

  it('keeps institution Mathematics analysis on the released registry taxonomy', () => {
    const definition = institutionAlignmentSql.slice(
      institutionAlignmentSql.indexOf('CREATE OR REPLACE FUNCTION public.free_pilot_legacy_learning_analysis'),
      institutionAlignmentSql.indexOf('REVOKE ALL ON FUNCTION public.free_pilot_legacy_learning_analysis'),
    )
    expect(definition).toMatch(/v_scope public\.curriculum_scope_releases%ROWTYPE/)
    expect(definition).toMatch(/scope\.game = p_game[\s\S]*scope\.display_exam_ref = p_exam_ref[\s\S]*scope\.release_status = 'released'/)
    expect(definition).toMatch(/curriculum_scope_integrity\([\s\S]*v_scope\.game,[\s\S]*v_scope\.display_exam_ref,[\s\S]*v_scope\.taxonomy_version/)
    expect(definition).toMatch(/v_integrity->>'primaryMismatch'[\s\S]*v_integrity->>'emptyOutcome'/)
    expect(definition).toMatch(/outcome\.game = v_scope\.game[\s\S]*outcome\.exam_ref = v_scope\.display_exam_ref[\s\S]*outcome\.taxonomy_version = v_scope\.taxonomy_version/)
    expect(definition).toMatch(/'taxonomyVersion', v_scope\.taxonomy_version/)
    expect(definition).toMatch(/'diagnosticEnabled', v_scope\.diagnostic_enabled/)
    expect(definition).not.toContain("'ba-tyt-math-v1'")
    expect(definition).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\b/i)
    expect(institutionAlignmentSql).toMatch(/REVOKE ALL ON FUNCTION public\.free_pilot_legacy_learning_analysis\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(institutionAlignmentSql).not.toContain('CREATE OR REPLACE FUNCTION public.get_institution_student_learning_analysis')
    expect(institutionAlignmentSql).toMatch(/pg_get_functiondef\(v_wrapper\)[\s\S]*institution_pilot_assert_operational_actor[\s\S]*free_pilot_legacy_learning_analysis/)
  })

  it('releases the NULL-exam-ref YDT English bank only after a complete proof', () => {
    expect(ydtEnglishReleaseSql).toMatch(/SET LOCAL lock_timeout = '10s'/)
    expect(ydtEnglishReleaseSql).toMatch(/SET LOCAL statement_timeout = '120s'/)
    expect(ydtEnglishReleaseSql).toMatch(/LOCK TABLE[\s\S]*public\.curriculum_scope_releases,[\s\S]*public\.session_answers,[\s\S]*public\.questions,[\s\S]*public\.question_outcomes,[\s\S]*public\.verified_attempts[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE TEMP TABLE ydt_english_scope_release_control[\s\S]*question_exam_ref IS NULL[\s\S]*release_status IN \('draft', 'validating', 'released'\)/)
    expect(ydtEnglishReleaseSql).toMatch(/IF NOT \(SELECT should_apply FROM ydt_english_scope_release_control\) THEN[\s\S]*RETURN/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.tg_normalize_wordquest_question_exam_ref\(\)[\s\S]*NEW\.exam_ref := NULL/)
    const normalizeTriggerSql = ydtEnglishReleaseSql.slice(
      ydtEnglishReleaseSql.indexOf('CREATE OR REPLACE FUNCTION public.tg_normalize_wordquest_question_exam_ref'),
      ydtEnglishReleaseSql.indexOf('DROP TRIGGER IF EXISTS trg_00_normalize_wordquest_question_exam_ref'),
    )
    expect(normalizeTriggerSql).toMatch(/IF NEW\.game::text = 'wordquest' THEN[\s\S]*NEW\.exam_ref := NULL/)
    expect(normalizeTriggerSql).not.toMatch(/NULLIF|btrim|COALESCE/)
    expect(ydtEnglishReleaseSql).toMatch(/BEFORE INSERT OR UPDATE OF game, exam_ref ON public\.questions/)
    expect(ydtEnglishReleaseSql).toMatch(/to_regprocedure\('public\.content_governance_authorize_question_write\(uuid,text\)'\)[\s\S]*WHERE game = 'wordquest'[\s\S]*exam_ref IS NOT NULL[\s\S]*SET exam_ref = NULL[\s\S]*content_governance_clear_question_write/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_question_curriculum_validation_scope\([\s\S]*scope\.release_status::text[\s\S]*scope\.display_exam_ref IS DISTINCT FROM normalized\.question_exam_ref[\s\S]*SELECT normalized\.question_exam_ref, NULL::text, NULL::text[\s\S]*WHERE NOT EXISTS \(SELECT 1 FROM split_scope\)/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.question_outcome_scope_valid\([\s\S]*curriculum_outcome_scope_valid\([\s\S]*scope\.display_exam_ref[\s\S]*outcome\.taxonomy_version IS NOT DISTINCT FROM scope\.taxonomy_version[\s\S]*scope\.release_status IS NULL[\s\S]*scope\.release_status IN \('validating','released'\)/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.question_active_outcome_mapping_valid\([\s\S]*question_outcome_scope_valid\([\s\S]*mapping\.question_id,mapping\.outcome_id/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.tg_question_outcome_split_scope_row_guard\(\)[\s\S]*scope\.taxonomy_version[\s\S]*v_release_status IN \('validating','released'\)[\s\S]*question_outcome_scope_valid\(NEW\.question_id, NEW\.outcome_id\)[\s\S]*ERRCODE = '22023'/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE TRIGGER trg_question_outcomes_split_scope_row_guard[\s\S]*BEFORE INSERT OR UPDATE OF question_id, outcome_id/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.assert_split_question_outcome_integrity\([\s\S]*scope\.taxonomy_version[\s\S]*v_release_status IN \('validating','released'\)[\s\S]*question_active_outcome_mapping_valid\(p_question_id\)[\s\S]*ERRCODE = '22023'/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE CONSTRAINT TRIGGER trg_questions_split_scope_integrity[\s\S]*AFTER INSERT OR UPDATE OF game, category, exam_ref, is_active[\s\S]*DEFERRABLE INITIALLY DEFERRED/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE CONSTRAINT TRIGGER trg_question_outcomes_split_scope_integrity[\s\S]*AFTER INSERT OR UPDATE OR DELETE[\s\S]*DEFERRABLE INITIALLY DEFERRED/)
    expect(ydtEnglishReleaseSql).toMatch(/REVOKE ALL ON FUNCTION public\.assert_split_question_outcome_integrity\(uuid\),[\s\S]*public\.tg_assert_split_question_outcome_integrity\(\),[\s\S]*public\.tg_question_outcome_split_scope_row_guard\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(ydtEnglishReleaseSql).toMatch(/tgdeferrable[\s\S]*tginitdeferred[\s\S]*v_split_trigger_count<>2[\s\S]*trg_question_outcomes_split_scope_row_guard[\s\S]*NOT tgdeferrable[\s\S]*v_split_row_trigger_count<>1/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_question_outcome_coverage\([\s\S]*scope\.display_exam_ref AS exam_ref[\s\S]*revision\.exam_ref IS NOT DISTINCT FROM question\.question_exam_ref[\s\S]*revision\.exam_ref IS NOT DISTINCT FROM question\.exam_ref/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.question_outcome_mapping_candidate_snapshot\(\)[\s\S]*scope\.display_exam_ref AS scope_exam_ref[\s\S]*scope\.release_status AS scope_release_status[\s\S]*revision\.exam_ref IS NOT DISTINCT FROM question\.exam_ref[\s\S]*revision\.exam_ref IS NOT DISTINCT FROM scope\.display_exam_ref[\s\S]*scope\.release_status IS NULL[\s\S]*scope\.release_status IN \('validating','released'\)/)
    expect(ydtEnglishReleaseSql).toMatch(/CREATE OR REPLACE FUNCTION public\.publish_question_content_revision\([\s\S]*INSERT INTO public\.question_outcomes[\s\S]*scope\.taxonomy_version IS NOT NULL[\s\S]*scope\.release_status NOT IN \('validating','released'\)[\s\S]*NOT public\.question_active_outcome_mapping_valid\(r\.question_id\)[\s\S]*published mapping is outside the active split curriculum scope/)
    expect(ydtEnglishReleaseSql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_question_curriculum_validation_scope\(text,text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(ydtEnglishReleaseSql).toMatch(/REVOKE ALL ON FUNCTION public\.question_outcome_mapping_candidate_snapshot\(\),[\s\S]*publish_question_content_revision\(uuid,uuid,uuid\)[\s\S]*GRANT EXECUTE ON FUNCTION public\.get_question_outcome_coverage\(uuid\),[\s\S]*TO service_role/)
    expect(ydtEnglishReleaseSql).toMatch(/WHERE game = 'wordquest'[\s\S]*exam_ref IS NULL[\s\S]*is_active/)
    expect(ydtEnglishReleaseSql).toMatch(/sync_taxonomy_auto_question_outcomes\([\s\S]*v_question\.exam_ref/)
    expect(ydtEnglishReleaseSql).toMatch(/curriculum_scope_integrity\([\s\S]*'wordquest', 'YDT', 'ba-ydt-eng-v1'/)
    for (const field of [
      'unmapped', 'scopeMismatch', 'nodeOrphan', 'outcomeOrphan',
      'primaryMismatch', 'emptyOutcome',
    ]) expect(ydtEnglishReleaseSql).toMatch(new RegExp(`v_integrity->>'${field}'`))
    expect(ydtEnglishReleaseSql).toMatch(/COALESCE\(\(v_integrity->>'total'\)::integer, 0\) <= 0/)
    expect(ydtEnglishReleaseSql).toMatch(/SET release_status = 'released'[\s\S]*resolve_released_curriculum_scope\('wordquest', 'YDT'\)/)
    expect(ydtEnglishReleaseSql).toMatch(/v_scope->'questionExamRef' IS DISTINCT FROM 'null'::jsonb/)
    expect(ydtEnglishReleaseSql).toMatch(/taxonomyVersion' <> 'ba-ydt-eng-v1'/)
    expect(ydtEnglishReleaseSql).toMatch(/diagnosticEnabled'[\s\S]*::boolean, true/)
  })

  it('repairs every missing current YDT English mapping and is replay-safe', () => {
    expect(ydtEnglishRepairSql).toMatch(/SET LOCAL lock_timeout = '10s'/)
    expect(ydtEnglishRepairSql).toMatch(/SET LOCAL statement_timeout = '120s'/)
    expect(ydtEnglishRepairSql).toMatch(/LOCK TABLE[\s\S]*public\.question_revision_outcomes,[\s\S]*public\.session_answers,[\s\S]*public\.verified_attempts,[\s\S]*public\.verified_attempt_hint_events,[\s\S]*public\.review_logs,[\s\S]*public\.mastery_materialized_attempts,[\s\S]*public\.mastery_outcome_evidence,[\s\S]*public\.curriculum_scope_evidence_repair_runs[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
    expect(ydtEnglishRepairSql).toMatch(/release_status = 'released'[\s\S]*curriculum_scope_integrity\([\s\S]*'wordquest', 'YDT', 'ba-ydt-eng-v1'/)
    expect(ydtEnglishRepairSql).toMatch(/JOIN public\.mastery_materialized_attempts AS marker ON marker\.attempt_id = attempt\.id/)
    const candidateSql = ydtEnglishRepairSql.slice(
      ydtEnglishRepairSql.indexOf('CREATE TEMP TABLE ydt_english_evidence_candidates'),
      ydtEnglishRepairSql.indexOf('CREATE TEMP TABLE ydt_english_inserted_evidence'),
    )
    const mappingJoinSql = candidateSql.slice(
      candidateSql.indexOf('JOIN public.question_outcomes AS mapping'),
      candidateSql.indexOf('JOIN public.curriculum_outcomes AS outcome'),
    )
    expect(mappingJoinSql).toMatch(/ON mapping\.question_id = question\.id/)
    expect(mappingJoinSql).not.toMatch(/mapping\.mapping_source/)
    expect(mappingJoinSql).not.toMatch(/mapping\.is_primary/)
    expect(ydtEnglishRepairSql).toMatch(/attempt\.game = 'wordquest'/)
    expect(ydtEnglishRepairSql).toMatch(/question\.game = 'wordquest'[\s\S]*NULLIF\(upper\(btrim\(COALESCE\(question\.exam_ref, ''\)\)\), ''\) IS NULL/)
    expect(candidateSql).not.toMatch(/answer\.answered_at\s*<\s*release\.released_at/)
    expect(candidateSql).not.toMatch(/AND\s+mapping\.created_at\s*>\s*answer\.answered_at/)
    expect(ydtEnglishRepairSql).toMatch(/JOIN public\.verified_attempt_question_revisions AS snapshot[\s\S]*snapshot\.attempt_id = attempt\.id[\s\S]*snapshot\.question_id = answer\.question_id[\s\S]*snapshot\.revision_id = answer\.question_revision_id[\s\S]*snapshot\.game = 'wordquest'/)
    expect(ydtEnglishRepairSql).toMatch(/snapshot\.difficulty::smallint[\s\S]*mapping\.weight \* snapshot\.difficulty/)
    expect(ydtEnglishRepairSql).toMatch(/NOT EXISTS \([\s\S]*mastery_outcome_evidence AS existing[\s\S]*existing\.answer_id = answer\.id[\s\S]*existing\.outcome_id = mapping\.outcome_id/)
    expect(ydtEnglishRepairSql).toMatch(/question_revision_outcomes AS historical_mapping[\s\S]*historical_mapping\.revision_id = snapshot\.revision_id/)
    expect(ydtEnglishRepairSql).toMatch(/ON CONFLICT \(answer_id, outcome_id\) DO NOTHING/)
    expect(ydtEnglishRepairSql).toMatch(/ON CONFLICT \(user_id, outcome_id\) DO UPDATE SET/)
    expect(ydtEnglishRepairSql).toContain("'188_ydt_english_complete_mappings_v1'")
    expect(ydtEnglishRepairSql).toMatch(/mapping_at_or_before_answer_rows[\s\S]*mapping_after_answer_rows/)
    expect(ydtEnglishRepairSql).toMatch(/IF NOT v_scope_released THEN[\s\S]*obsolete YDT English v1 repair mutated rows/)
    expect(ydtEnglishRepairSql).toMatch(/v_candidates <> v_inserted[\s\S]*YDT English evidence repair lost rows/)
  })

  it('does not re-run the YDT taxonomy sync when a released scope migration is replayed', () => {
    const controlSql = ydtEnglishReleaseSql.slice(
      ydtEnglishReleaseSql.indexOf('CREATE TEMP TABLE ydt_english_scope_release_control'),
      ydtEnglishReleaseSql.indexOf('DO $fn$\nDECLARE\n  v_question record;'),
    )
    const syncStart = ydtEnglishReleaseSql.indexOf('DO $fn$\nDECLARE\n  v_question record;')
    const syncEnd = ydtEnglishReleaseSql.indexOf('DO $fn$\nDECLARE\n  v_integrity jsonb;', syncStart)
    const syncSql = ydtEnglishReleaseSql.slice(syncStart, syncEnd)
    const canonicalizationStart = ydtEnglishReleaseSql.indexOf('DO $fn$\nDECLARE\n  v_question_id uuid;')
    const canonicalizationEnd = ydtEnglishReleaseSql.indexOf('DO $fn$\nDECLARE\n  v_updated integer;', canonicalizationStart)
    const canonicalizationSql = ydtEnglishReleaseSql.slice(canonicalizationStart, canonicalizationEnd)
    const validatingStart = canonicalizationEnd
    const validatingEnd = syncStart
    const validatingSql = ydtEnglishReleaseSql.slice(validatingStart, validatingEnd)
    const integrityStart = syncEnd
    const finalReleaseStart = ydtEnglishReleaseSql.indexOf('UPDATE public.curriculum_scope_releases\nSET release_status = \'released\'', integrityStart)
    const integritySql = ydtEnglishReleaseSql.slice(integrityStart, finalReleaseStart)
    const finalReleaseEnd = ydtEnglishReleaseSql.indexOf('DO $fn$\nDECLARE\n  v_scope jsonb;', finalReleaseStart)
    const finalReleaseSql = ydtEnglishReleaseSql.slice(finalReleaseStart, finalReleaseEnd)
    const postcheckSql = ydtEnglishReleaseSql.slice(finalReleaseEnd)

    expect(controlSql).toMatch(/should_apply boolean NOT NULL/)
    expect(controlSql).toMatch(/should_sync boolean NOT NULL/)
    expect(controlSql).toMatch(/release_status IN \('draft', 'validating', 'released'\)/)
    expect(controlSql).toMatch(/release_status IN \('draft', 'validating'\)/)
    expect(canonicalizationSql).toMatch(/IF NOT \(SELECT should_sync FROM ydt_english_scope_release_control\) THEN[\s\S]*RETURN/)
    expect(validatingSql).toMatch(/IF NOT \(SELECT should_sync FROM ydt_english_scope_release_control\) THEN[\s\S]*RETURN/)
    expect(syncSql).toMatch(/IF NOT \(SELECT should_sync FROM ydt_english_scope_release_control\) THEN[\s\S]*RETURN/)
    expect(syncSql).toMatch(/sync_taxonomy_auto_question_outcomes/)
    expect(integritySql).toMatch(/IF NOT \(SELECT should_apply FROM ydt_english_scope_release_control\) THEN[\s\S]*RETURN/)
    expect(finalReleaseSql).toMatch(/AND \(SELECT should_sync FROM ydt_english_scope_release_control\)/)
    expect(postcheckSql).toMatch(/IF NOT \(SELECT should_apply FROM ydt_english_scope_release_control\) THEN[\s\S]*RETURN/)
  })

  it('fails closed before release when historical mastery provenance is incomplete', () => {
    for (const { sql, game, examRef, nextBlock } of [
      {
        sql: ydtEnglishReleaseSql,
        game: "'wordquest'",
        examRef: "(?:NULLIF\\(upper\\(btrim\\(COALESCE\\(snapshot\\.exam_ref, ''\\)\\)\\), ''\\) IS NULL[\\s\\S]*upper\\(btrim\\(snapshot\\.exam_ref\\)\\) = 'YDT')",
        nextBlock: 'DO $fn$\nDECLARE\n  v_updated integer;',
      },
      {
        sql: tytTurkishReleaseSql,
        game: 'target.game',
        examRef: 'upper\\(btrim\\(COALESCE\\(snapshot\\.exam_ref, \'\'\\)\\)\\) IS DISTINCT FROM target.question_exam_ref',
        nextBlock: 'DO $fn$\nDECLARE\n  v_expected integer;',
      },
      {
        sql: tytSocialReleaseSql,
        game: 'target.game',
        examRef: 'upper\\(btrim\\(COALESCE\\(snapshot\\.exam_ref, \'\'\\)\\)\\) IS DISTINCT FROM target.question_exam_ref',
        nextBlock: 'DO $fn$\nDECLARE\n  v_expected integer;',
      },
    ]) {
      const start = sql.indexOf('DO $fn$\nDECLARE\n  v_marker_gap integer;')
      const provenanceSql = sql.slice(start, sql.indexOf(nextBlock, start))
      expect(provenanceSql).toMatch(/v_marker_gap integer;[\s\S]*v_snapshot_gap integer/)
      expect(provenanceSql).toMatch(/NOT EXISTS \([\s\S]*mastery_materialized_attempts AS marker[\s\S]*marker\.attempt_id = attempt\.id/)
      expect(provenanceSql).toMatch(/JOIN public\.mastery_materialized_attempts AS marker[\s\S]*marker\.attempt_id = attempt\.id/)
      expect(provenanceSql).toMatch(/LEFT JOIN public\.verified_attempt_question_revisions AS snapshot[\s\S]*snapshot\.attempt_id = attempt\.id[\s\S]*snapshot\.question_id = answer\.question_id/)
      expect(provenanceSql).toMatch(/snapshot\.question_id IS NULL[\s\S]*answer\.question_revision_id IS NULL[\s\S]*snapshot\.revision_id IS DISTINCT FROM answer\.question_revision_id/)
      expect(provenanceSql).toMatch(new RegExp(`snapshot\\.game IS DISTINCT FROM ${game}`))
      expect(provenanceSql).toMatch(new RegExp(examRef))
      expect(provenanceSql).toMatch(/snapshot\.category IS DISTINCT FROM question\.category::text/)
      expect(provenanceSql).toMatch(/IF v_marker_gap <> 0 OR v_snapshot_gap <> 0 THEN[\s\S]*RAISE EXCEPTION[\s\S]*provenance/)
    }
  })

  it('releases TYT Turkish and Social through a guarded cutover only', () => {
    for (const { sql, game, taxonomy, releaseGate } of [
      { sql: tytTurkishReleaseSql, game: 'turkce', taxonomy: 'ba-tyt-turkce-v2', releaseGate: 'should_apply' },
      { sql: tytSocialReleaseSql, game: 'sosyal', taxonomy: 'ba-tyt-sosyal-v1', releaseGate: 'should_release' },
    ]) {
      expect(sql).toMatch(/SET LOCAL lock_timeout = '10s'/)
      expect(sql).toMatch(/SET LOCAL statement_timeout = '120s'/)
      expect(sql).toMatch(/LOCK TABLE[\s\S]*public\.question_revision_outcomes,[\s\S]*public\.verified_attempt_question_revisions,[\s\S]*public\.mastery_outcome_evidence,[\s\S]*public\.user_outcome_state[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_question_curriculum_validation_scope\([\s\S]*registered_scope[\s\S]*scope\.question_exam_ref IS NOT DISTINCT FROM normalized\.question_exam_ref/)
      expect(sql).toMatch(/question outcome is outside the active registered curriculum scope/)
      expect(sql).toMatch(/active registered-scope question mapping is invalid or unreleased/)
      expect(sql).toMatch(new RegExp(`\\('${game}','TYT','TYT','${taxonomy}'\\)`))
      expect(sql).toMatch(/CREATE TEMP TABLE tyt_humanities_scope_release_control[\s\S]*should_apply boolean NOT NULL,[\s\S]*should_sync boolean NOT NULL/)
      expect(sql).toMatch(/release_status IN \('draft','validating','released'\)/)
      expect(sql).toMatch(/release_status IN \('draft','validating'\)/)
      expect(sql).toMatch(/sync_taxonomy_auto_question_outcomes[\s\S]*v_question\.exam_ref/)
      expect(sql).toMatch(/(?:ON|WHERE) target\.should_sync/)
      expect(sql).toMatch(/diagnostic_enabled = false/)
      expect(sql).toMatch(/curriculum_scope_integrity\([\s\S]*v_target\.game, v_target\.display_exam_ref, v_target\.taxonomy_version/)
      for (const field of [
        'unmapped', 'scopeMismatch', 'nodeOrphan', 'outcomeOrphan',
        'primaryMismatch', 'emptyOutcome',
      ]) expect(sql).toMatch(new RegExp(`v_integrity->>'${field}'`))
      expect(sql).toMatch(/COALESCE\(\(v_integrity->>'total'\)::integer, 0\) <= 0/)
      expect(sql).toMatch(/SET release_status = 'released'[\s\S]*resolve_released_curriculum_scope/)
      expect(sql).toMatch(/registered validation scope postcheck failed/)
      expect(sql).toMatch(/registered-scope deferred integrity triggers are not enabled/)
      expect(sql).toMatch(/registered-scope immediate mapping guard is not enabled/)

      const transitionStart = sql.indexOf('DO $fn$\nDECLARE\n  v_expected integer;')
      const syncStart = sql.indexOf('DO $fn$\nDECLARE\n  v_question record;', transitionStart)
      const transitionSql = sql.slice(transitionStart, syncStart)
      const integrityStart = sql.indexOf('DO $fn$\nDECLARE\n  v_target record;\n  v_integrity jsonb;', syncStart)
      const syncSql = sql.slice(syncStart, integrityStart)
      const finalReleaseStart = sql.indexOf('UPDATE public.curriculum_scope_releases AS scope\nSET release_status = \'released\'', integrityStart)
      const integritySql = sql.slice(integrityStart, finalReleaseStart)
      const postcheckStart = sql.indexOf('DO $fn$\nDECLARE\n  v_target record;\n  v_scope jsonb;', finalReleaseStart)
      const finalReleaseSql = sql.slice(finalReleaseStart, postcheckStart)
      const postcheckSql = sql.slice(postcheckStart)

      expect(transitionSql).toMatch(/WHERE should_sync[\s\S]*WHERE target\.should_sync/)
      expect(syncSql).toMatch(/ON target\.should_sync[\s\S]*sync_taxonomy_auto_question_outcomes/)
      expect(integritySql).toMatch(new RegExp(`WHERE ${releaseGate}[\\s\\S]*curriculum_scope_integrity`))
      expect(finalReleaseSql).toMatch(/WHERE target\.should_sync/)
      expect(postcheckSql).toMatch(new RegExp(`WHERE ${releaseGate}[\\s\\S]*resolve_released_curriculum_scope`))
    }
  })

  it('keeps incomplete TYT Social draft while allowing the migration chain to continue', () => {
    expect(tytSocialReleaseSql).toMatch(/should_sync boolean NOT NULL,[\s\S]*should_release boolean NOT NULL/)
    for (const category of ['tarih', 'cografya', 'felsefe', 'sosyoloji', 'din_kulturu']) {
      expect(tytSocialReleaseSql).toContain(`('${category}')`)
    }
    expect(tytSocialReleaseSql).toMatch(/NOT EXISTS \([\s\S]*public\.questions AS question[\s\S]*question\.is_active[\s\S]*question\.category::text = required\.category/)
    expect(tytSocialReleaseSql).toMatch(/scope\.release_status IN \('draft','validating'\)[\s\S]*readiness\.has_required_categories/)
    expect(tytSocialReleaseSql).toMatch(/WHERE should_release[\s\S]*curriculum_scope_integrity/)
    expect(tytSocialReleaseSql).toMatch(/target\.should_apply[\s\S]*NOT target\.should_release[\s\S]*incomplete TYT Social scope was not kept fail-closed/)
    expect(tytSocialRepairSql).not.toContain('TYT Social evidence repair requires a released v1 scope')
    expect(tytSocialRepairSql).toMatch(/WHERE scope\.release_status = 'released'/)
  })

  it('requires append-only human source-policy proof and fails closed on replay drift', () => {
    expect(tytSocialReleaseSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_source_policy_evidence/)
    expect(tytSocialReleaseSql).toMatch(/evidence_sha256 text NOT NULL[\s\S]*evidence_manifest jsonb NOT NULL/)
    expect(tytSocialReleaseSql).toMatch(/BEFORE UPDATE OR DELETE ON public\.curriculum_scope_source_policy_evidence/)
    expect(tytSocialReleaseSql).toMatch(/curriculum scope source-policy evidence is append-only/)
    expect(tytSocialReleaseSql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_source_policy_evidence[\s\S]*PUBLIC, anon, authenticated, service_role/)

    const policyStart = tytSocialReleaseSql.indexOf(
      'CREATE OR REPLACE FUNCTION public.tyt_social_source_policy_integrity',
    )
    const policyEnd = tytSocialReleaseSql.indexOf(
      'REVOKE ALL ON FUNCTION public.tyt_social_source_policy_integrity',
      policyStart,
    )
    const policySql = tytSocialReleaseSql.slice(policyStart, policyEnd)
    expect(policySql).toContain("('din_kulturu',2)")
    expect(policySql).toMatch(/question\.published_revision_id[\s\S]*revision\.status = 'published'/)
    expect(policySql).toMatch(/revision\.change_kind <> 'legacy_import'/)
    expect(policySql).toMatch(/source\.provenance_ref[\s\S]*NOT LIKE 'legacy:%'/)
    expect(policySql).toMatch(/stage_one\.decision = 'approved'[\s\S]*stage_two\.decision = 'approved'/)
    expect(policySql).toMatch(/stage_one\.reviewer_id IS DISTINCT FROM stage_two\.reviewer_id/)
    expect(policySql).toMatch(/approved_questions = active_questions/)
    expect(policySql).toMatch(/'policyVersion','social-human-source-v1'/)
    expect(policySql).toMatch(/extensions\.digest\(manifest\.evidence_manifest::text, 'sha256'\)/)
    expect(policySql).toMatch(/'sourceReady',[\s\S]*summary\.required_categories_ready/)
    expect(policySql).toMatch(/'candidatePolicyVersion',NULL/)
    expect(policySql).toMatch(/'candidatePolicyReady',false/)
    expect(policySql).toContain("'candidatePolicyReason','candidate-exam-category-policy-missing'")
    expect(policySql).toMatch(/'ready',false/)
    expect(tytSocialReleaseSql).not.toMatch(/candidatePolicyReady',true/)

    expect(tytSocialReleaseSql).toMatch(/source_policy_ready boolean NOT NULL/)
    expect(tytSocialReleaseSql).toMatch(/readiness\.has_required_categories[\s\S]*source_policy\.is_ready/)
    expect(tytSocialReleaseSql).toMatch(/INSERT INTO public\.curriculum_scope_source_policy_evidence[\s\S]*ON CONFLICT/)
    const sourceLedgerInsert = tytSocialReleaseSql.slice(
      tytSocialReleaseSql.indexOf('INSERT INTO public.curriculum_scope_source_policy_evidence'),
      tytSocialReleaseSql.indexOf('DO $fn$', tytSocialReleaseSql.indexOf('INSERT INTO public.curriculum_scope_source_policy_evidence')),
    )
    expect(sourceLedgerInsert).toMatch(/WHERE target\.source_policy_ready/)
    expect(sourceLedgerInsert).not.toMatch(/sourceReady/)
    expect(tytSocialReleaseSql).toMatch(/SET release_status = 'draft',[\s\S]*diagnostic_enabled = false[\s\S]*NOT target\.should_release/)
    expect(tytSocialReleaseSql).not.toMatch(/SET release_status = 'draft',[\s\S]{0,120}released_at = NULL/)
    expect(tytSocialReleaseSql).toMatch(/scope\.released_at IS DISTINCT FROM target\.prior_released_at/)

    const repairTargetSql = tytSocialRepairSql.slice(
      tytSocialRepairSql.indexOf('CREATE TEMP TABLE tyt_humanities_repair_targets'),
      tytSocialRepairSql.indexOf('DO $fn$', tytSocialRepairSql.indexOf('CREATE TEMP TABLE tyt_humanities_repair_targets')),
    )
    expect(repairTargetSql).toMatch(/tyt_social_source_policy_integrity/)
    expect(repairTargetSql).toMatch(/source_policy\.evidence->>'ready'/)
    expect(repairTargetSql).toMatch(/curriculum_scope_source_policy_evidence AS recorded/)
    expect(repairTargetSql).toMatch(/recorded\.evidence_sha256 = source_policy\.evidence->>'evidenceSha256'/)
  })

  it('backfills only missing current Turkish and Social mappings additively with a replay ledger', () => {
    for (const { sql, game, taxonomy, repairKey } of [
      { sql: tytTurkishRepairSql, game: 'turkce', taxonomy: 'ba-tyt-turkce-v2', repairKey: '190_tyt_turkce_complete_mappings_v2' },
      { sql: tytSocialRepairSql, game: 'sosyal', taxonomy: 'ba-tyt-sosyal-v1', repairKey: '192_tyt_sosyal_complete_mappings_v1' },
    ]) {
      expect(sql).toMatch(/SET LOCAL lock_timeout = '10s'/)
      expect(sql).toMatch(/SET LOCAL statement_timeout = '120s'/)
      expect(sql).toMatch(/LOCK TABLE[\s\S]*public\.question_revision_outcomes,[\s\S]*public\.verified_attempt_question_revisions,[\s\S]*public\.mastery_materialized_attempts,[\s\S]*public\.mastery_outcome_evidence,[\s\S]*public\.curriculum_scope_evidence_repair_runs[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
      expect(sql).toMatch(new RegExp(`\\('${game}','TYT','TYT','${taxonomy}'\\)`))
      expect(sql).toContain(`'${repairKey}'`)
      expect(sql).toMatch(/WHERE scope\.release_status = 'released'/)
      if (game === 'turkce') {
        expect(sql).toMatch(/release_status NOT IN \('released','retired'\)/)
      } else {
        expect(sql).not.toContain('TYT Social evidence repair requires a released v1 scope')
      }
      expect(sql).toMatch(/curriculum_scope_integrity\([\s\S]*v_target\.game, v_target\.display_exam_ref, v_target\.taxonomy_version/)
      expect(sql).toMatch(/JOIN public\.mastery_materialized_attempts AS marker\s+ON marker\.attempt_id = attempt\.id/)
      const candidateSql = sql.slice(
        sql.indexOf('CREATE TEMP TABLE tyt_humanities_evidence_candidates'),
        sql.indexOf('CREATE TEMP TABLE tyt_humanities_inserted_evidence'),
      )
      const mappingJoinSql = candidateSql.slice(
        candidateSql.indexOf('JOIN public.question_outcomes AS mapping'),
        candidateSql.indexOf('JOIN public.curriculum_outcomes AS outcome'),
      )
      expect(mappingJoinSql).toMatch(/ON mapping\.question_id = question\.id/)
      expect(mappingJoinSql).not.toMatch(/mapping\.mapping_source|mapping\.is_primary/)
      expect(candidateSql).not.toMatch(/answer\.answered_at\s*<\s*release\.released_at/)
      expect(candidateSql).not.toMatch(/AND\s+mapping\.created_at\s*>\s*answer\.answered_at/)
      expect(candidateSql).toMatch(/NOT EXISTS \([\s\S]*mastery_outcome_evidence AS existing[\s\S]*existing\.answer_id = answer\.id[\s\S]*existing\.outcome_id = mapping\.outcome_id/)
      expect(candidateSql).toMatch(/question_revision_outcomes AS historical_mapping[\s\S]*historical_mapping\.revision_id = snapshot\.revision_id/)
      expect(sql).toMatch(/ON CONFLICT \(answer_id, outcome_id\) DO NOTHING/)
      expect(sql).toMatch(/ON CONFLICT \(user_id, outcome_id\) DO UPDATE SET[\s\S]*attempts = public\.user_outcome_state\.attempts \+ EXCLUDED\.attempts/)
      expect(sql).toMatch(/mapping_at_or_before_answer_rows[\s\S]*mapping_after_answer_rows/)
      expect(sql).toMatch(/v_candidates <> v_inserted[\s\S]*evidence repair lost rows/)
      expect(sql).toMatch(/evidence repair left missing rows/)
      expect(sql).toMatch(/repair_key = v_target\.repair_key[\s\S]*inserted_evidence_rows = v_inserted/)
      expect(sql).toMatch(/v_target_count = 0[\s\S]*obsolete TYT (?:Turkish|Social) v[12] repair mutated rows/)
    }
  })

  it('versions TYT Turkish without importing the AYT literature leaf', () => {
    expect(tytTurkishReleaseSql).toMatch(/released TYT Turkish v1 cannot be rewritten as v2/)
    expect(tytTurkishReleaseSql).toMatch(/SET taxonomy_version = 'ba-tyt-turkce-v2'[\s\S]*taxonomy_version = 'ba-tyt-turkce-v1'/)
    expect(tytTurkishReleaseSql).toContain("'ba-tyt-turkce-v2:course'")
    expect(tytTurkishReleaseSql).toContain("'TUR2-PAR-01'")
    expect(tytTurkishReleaseSql).toContain("'TUR2-ANL-01'")
    expect(tytTurkishReleaseSql).not.toContain("'TUR2-EDB-01'")
    expect(tytTurkishReleaseSql).not.toContain("'ba-tyt-turkce-v2:topic:edebiyat'")
    expect(tytTurkishRepairSql).toContain("'190_tyt_turkce_complete_mappings_v2'")
    expect(tytTurkishReleaseSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.curriculum_scope_release_history/)
    expect(tytTurkishReleaseSql).toContain("'189_tyt_turkce_v2_cutover'")
    expect(tytTurkishReleaseSql).toMatch(/REVOKE ALL ON TABLE public\.curriculum_scope_release_history[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
  })

  it('repairs only immutable marker-backed snapshots and never falls back to mutable question metadata', () => {
    for (const { sql, game, examGate } of [
      {
        sql: ydtEnglishRepairSql,
        game: "'wordquest'",
        examGate: "NULLIF\\(upper\\(btrim\\(COALESCE\\(snapshot\\.exam_ref, ''\\)\\)\\), ''\\) IS NULL[\\s\\S]*upper\\(btrim\\(snapshot\\.exam_ref\\)\\) = 'YDT'",
      },
      {
        sql: tytTurkishRepairSql,
        game: 'target.game',
        examGate: 'upper\\(btrim\\(COALESCE\\(snapshot\\.exam_ref, \'\'\\)\\)\\) = target.question_exam_ref',
      },
      {
        sql: tytSocialRepairSql,
        game: 'target.game',
        examGate: 'upper\\(btrim\\(COALESCE\\(snapshot\\.exam_ref, \'\'\\)\\)\\) = target.question_exam_ref',
      },
    ]) {
      const provenanceStart = sql.indexOf('DO $fn$\nDECLARE\n  v_marker_gap integer;')
      const candidateStart = sql.indexOf('CREATE TEMP TABLE', provenanceStart)
      const provenanceSql = sql.slice(provenanceStart, candidateStart)
      const candidateEnd = sql.indexOf('CREATE TEMP TABLE', candidateStart + 1)
      const candidateSql = sql.slice(candidateStart, candidateEnd)
      expect(provenanceSql).toMatch(/v_marker_gap integer;[\s\S]*v_snapshot_gap integer[\s\S]*RAISE EXCEPTION[\s\S]*provenance/)
      expect(candidateSql).toMatch(/JOIN public\.mastery_materialized_attempts AS marker\s+ON marker\.attempt_id = attempt\.id/)
      expect(candidateSql).toMatch(/JOIN public\.verified_attempt_question_revisions AS snapshot[\s\S]*snapshot\.attempt_id = attempt\.id[\s\S]*snapshot\.question_id = answer\.question_id[\s\S]*snapshot\.revision_id = answer\.question_revision_id/)
      expect(candidateSql).toMatch(new RegExp(`snapshot\\.game = ${game}`))
      expect(candidateSql).toMatch(new RegExp(examGate))
      expect(candidateSql).toMatch(/snapshot\.category IS NOT DISTINCT FROM question\.category::text/)
      expect(candidateSql).toMatch(/snapshot\.difficulty::smallint[\s\S]*mapping\.weight \* snapshot\.difficulty/)
      expect(candidateSql).not.toMatch(/LEFT JOIN public\.verified_attempt_question_revisions AS snapshot|COALESCE\(snapshot\.difficulty, question\.difficulty\)/)
    }
  })
})
