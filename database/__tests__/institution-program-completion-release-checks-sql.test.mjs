import {readFile} from 'node:fs/promises'
import {beforeAll,describe,expect,it} from 'vitest'

const checks=new URL('../checks/',import.meta.url)
let preflight,postcheck
const dataBlock=(sql)=>sql.match(/DO \$data_check\$[\s\S]*?\$data_check\$;/)?.[0]
const executableText=(sql)=>sql
  .replace(/--[^\r\n]*|\/\*[\s\S]*?\*\//g,'')
  .replace(/'(?:''|[^'])*'/g,"''")

beforeAll(async()=>{
  [preflight,postcheck]=await Promise.all(['preflight','postcheck'].map(name=>readFile(
    new URL(`211_institution_program_completion_${name}.sql`,checks),'utf8',
  )))
})

describe('211 standalone read-only release checks',()=>{
  it.each(['preflight','postcheck'])('%s cannot mutate state or acquire explicit locks',name=>{
    const sql=name==='preflight'?preflight:postcheck
    const executable=executableText(sql)
    expect(sql).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')
    expect(sql).toContain("SET LOCAL statement_timeout='30s';")
    expect(sql).toContain("SET LOCAL lock_timeout='3s';")
    expect(sql).toContain("SET LOCAL idle_in_transaction_session_timeout='60s';")
    expect(sql.trimEnd()).toMatch(/ROLLBACK;$/)
    expect(executable.match(/^ROLLBACK;$/gm)).toHaveLength(1)
    expect(executable).not.toMatch(/\b(?:COMMIT|INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|NOTIFY|PERFORM|EXECUTE)\b/i)
    expect(executable).not.toMatch(/\bLOCK\s+TABLE\b|\bFOR\s+(?:SHARE|NO\s+KEY|KEY\s+SHARE)\b|\bREAD\s+WRITE\b/i)
    expect(executable).not.toMatch(/\b(?:\w*advisory\w*|set_config|dblink\w*|pg_sleep)\s*\(/i)
    expect(sql).toContain("current_setting('transaction_read_only')='on' AS read_only")
  })

  it('recomputes the same evidence before and after installation without calling a helper',()=>{
    expect(dataBlock(preflight)).toBeTruthy()
    expect(dataBlock(postcheck)).toBe(dataBlock(preflight))
    expect(preflight).not.toContain('institution_study_program_completion_ready')
    for(const sql of [preflight,postcheck]) {
      const executable=executableText(sql)
      expect(executable).not.toMatch(/\bpublic\.(?:institution_study_program_completion_ready|sync_institution_study_program_completion|enforce_institution_study_program_completion|sync_institution_study_program_item_completion|review_institution_study_program)\s*\(/)
    }
    const data=dataBlock(preflight)
    expect(data).toContain('count(position) AS actual_item_count,bool_and(trusted_item) AS all_items_trusted')
    expect(data).toContain('LEFT JOIN public.institution_study_program_items item')
    expect(data).toContain('totals.actual_item_count IS DISTINCT FROM program.item_count::bigint')
    expect(data).toContain('OR NOT totals.all_items_trusted')
    expect(data).toContain('program.completed_at IS NULL OR program.item_count<1')
    expect(data).toContain("item.status='completed' AND item.completed_at IS NOT NULL")
    expect(data).toContain('item.target_question_count BETWEEN 1 AND 10')
    expect(data).toContain('OR NOT EXISTS (SELECT 1 FROM public.institution_study_program_reviews review')
    for(const key of ['institution_id','classroom_id','membership_id','student_id','teacher_id']) {
      expect(data).toContain(`review.${key}=program.${key}`)
    }
  })

  it('checks actual scoped practice and diagnostic sources, not just status labels',()=>{
    const data=dataBlock(preflight)
    for(const key of ['student_id','game','display_exam_ref','taxonomy_version']) {
      expect(data).toContain(`execution.${key}=program.${key}`)
    }
    expect(data).toContain('execution.task_type=item.task_type')
    expect(data).toContain('execution.question_exam_ref IS NOT DISTINCT FROM program.question_exam_ref')
    expect(data).toContain("execution.status='completed' AND execution.expired_at IS NULL")
    expect(data).toContain('execution.completed_at=item.completed_at')
    expect(data).toContain('execution.completed_at BETWEEN execution.started_at AND execution.expires_at')
    expect(data).toContain('attempt.id=execution.verified_attempt_id AND attempt.user_id=program.student_id')
    expect(data).toContain("attempt.mode='practice' AND attempt.session_id IS NOT NULL")
    expect(data).toContain('count(DISTINCT evidence.answer_id)')
    expect(data).toContain('NOT COALESCE(answer.is_skipped,false)')
    expect(data).toContain('session.id=execution.diagnostic_session_id AND session.user_id=program.student_id')
    expect(data).toContain('session.question_exam_ref IS NOT DISTINCT FROM program.question_exam_ref')
    expect(data).toContain('FROM public.adaptive_diagnostic_answers answer')
    expect(data).toContain('session.started_at>=execution.started_at AND session.completed_at=execution.completed_at')
    expect(data).toContain('outcome.taxonomy_version=program.taxonomy_version')
    expect(data).toContain('WHERE rolname=current_user AND (rolsuper OR rolbypassrls)')
    expect(data).toContain("USING ERRCODE='42501'")
    expect(data).toContain("USING ERRCODE='23514'")
  })

  it('checks private helper and service-only review security/catalog shape',()=>{
    expect(postcheck).toContain("('public.institution_study_program_completion_ready(uuid)','bool','s',false)")
    expect(postcheck).toContain("('public.sync_institution_study_program_completion(uuid)','void','v',false)")
    expect(postcheck).toContain("('public.enforce_institution_study_program_completion()','trigger','v',false)")
    expect(postcheck).toContain("('public.sync_institution_study_program_item_completion()','trigger','v',false)")
    expect(postcheck).toContain("('public.review_institution_study_program(uuid,text,text,text,uuid)','jsonb','v',true)")
    expect(postcheck).toContain('NOT v_proc.prosecdef')
    expect(postcheck).toContain("v_proc.prokind<>'f' OR v_proc.proretset")
    expect(postcheck).toContain("v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]")
    expect(postcheck).toContain("ARRAY['public','anon','authenticated','service_role']")
    expect(postcheck).toContain("has_function_privilege(v_role,v_proc.oid,'EXECUTE') IS DISTINCT FROM")
    expect(postcheck).toContain("(v_role='service_role' AND v_expected.service_execute)")
  })

  it('requires exactly four full-event deferred triggers and one status-only sync',()=>{
    for(const [table,trigger] of [
      ['institution_study_programs','institution_program_completion_contract'],
      ['institution_study_program_items','institution_program_item_completion_contract'],
      ['institution_study_program_item_executions','institution_program_execution_completion_contract'],
      ['institution_study_program_reviews','institution_program_review_completion_contract'],
    ]) expect(postcheck).toContain(`('public.${table}','${trigger}')`)
    expect(postcheck).toContain('v_trigger.tgtype<>29')
    expect(postcheck).toContain('NOT v_trigger.tgdeferrable OR NOT v_trigger.tginitdeferred')
    expect(postcheck).toContain("v_trigger.tgattr::text<>''")
    expect(postcheck).toContain('WHERE tgfoid=v_guard_oid)<>4')
    expect(postcheck).toContain('v_trigger.tgtype<>17')
    expect(postcheck).toContain("AND attname='status'")
    expect(postcheck).toContain('v_trigger.tgattr::text<>v_status_attnum')
    expect(postcheck).toContain('WHERE tgfoid=v_sync_oid)<>1')
    expect(postcheck).toContain("v_trigger.tgenabled<>'O'")
    expect(postcheck).toContain('v_trigger.tgnargs<>0 OR octet_length(v_trigger.tgargs)<>0')
    expect(postcheck).toContain('v_trigger.tgqual IS NOT NULL')
    expect(postcheck).toContain('v_trigger.tgconstrrelid<>0 OR v_trigger.tgconstrindid<>0')
  })

  it.each(['preflight','postcheck'])('%s emits aggregate proof with explicit boundaries',name=>{
    const sql=name==='preflight'?preflight:postcheck
    expect(sql).toContain('NOT migration-ledger, feature-flag, deployment, or production-clone proof')
    const result=sql.slice(sql.lastIndexOf(`SELECT 'institution_program_completion_211_${name}'`))
    expect(result).toContain('AS check_name')
    expect(result).toContain('true AS passed')
    expect(result).toContain('AS completed_programs_checked')
    expect(result).toContain('false AS production_readiness_proof')
    expect(result).not.toMatch(/user_id|student_id|teacher_id|membership_id|program_ref|email|note|evidence/i)
  })
})
