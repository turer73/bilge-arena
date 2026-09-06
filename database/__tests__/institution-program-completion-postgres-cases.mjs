import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'

// Registered after the existing institution acceptance cases. Reuses their
// disposable schema/seed without weakening or rewriting historical assertions.
export function registerInstitutionProgramCompletionTests(getContext, migrationSql) {
  describe('forward program completion contract', () => {
    let client, platformAdmin, managerOne, managerTwo, institutionOne, rpc, authenticatedRpc, expectPgError, url
    let classroom, outcome, weekStart, foreignManager
    let preflightSql, postcheckSql, dataCheckSql, catalogCheckSql, preflightReceipt, initialPostcheckReceipt

    beforeAll(async () => {
      ({ client, platformAdmin, managerOne, managerTwo, institutionOne, rpc, authenticatedRpc, expectPgError, url } = getContext())
      preflightSql=readFileSync(new URL('../checks/211_institution_program_completion_preflight.sql',import.meta.url),'utf8')
      postcheckSql=readFileSync(new URL('../checks/211_institution_program_completion_postcheck.sql',import.meta.url),'utf8')
      dataCheckSql=extractDataCheck(preflightSql)
      expect(extractDataCheck(postcheckSql)).toBe(dataCheckSql)
      const catalogBlocks=[...postcheckSql.matchAll(/DO \$catalog_check\$[\s\S]*?\$catalog_check\$;/g)]
      expect(catalogBlocks).toHaveLength(1)
      catalogCheckSql=catalogBlocks[0][0]
      // These exact release files own their READ ONLY transaction boundaries.
      // Execute them outside the fixture transactions: nesting the wrapper
      // would cause its ROLLBACK to discard an unrelated fixture transaction.
      preflightReceipt=await runReadOnlyCheck(preflightSql,'institution_program_completion_211_preflight')
      await client.query(migrationSql())
      await client.query(migrationSql())
      initialPostcheckReceipt=await runReadOnlyCheck(postcheckSql,'institution_program_completion_211_postcheck')
      classroom = (await client.query(`INSERT INTO public.teacher_classrooms(teacher_id,name,institution_id)
        VALUES($1,'Completion Contract Classroom',$2) RETURNING id`, [managerOne, institutionOne])).rows[0].id
      outcome = (await client.query(`SELECT id,code FROM public.curriculum_outcomes
        WHERE game='matematik' AND exam_ref='TYT' AND taxonomy_version='ba-tyt-math-v1'
          AND is_active AND code='MAT-SAY-01'`)).rows[0]
      weekStart = (await client.query(`SELECT
        date_trunc('week',clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text AS value`)).rows[0].value
      // Earlier lifecycle cases intentionally suspend/remove their actors.
      // BOLA needs a genuinely operational foreign tenant, not an early
      // rejection caused by that historical fixture's revoked access.
      foreignManager=randomUUID()
      const name=`completion-foreign-${foreignManager.slice(0,8)}`
      await client.query('INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$2)',[foreignManager,name])
      await client.query(`INSERT INTO auth.users(id,email,email_confirmed_at)
        VALUES($1,$2,clock_timestamp())`,[foreignManager,`${name}@example.com`])
      const foreignInstitution=(await client.query(`INSERT INTO public.pilot_institutions(name,status,created_by,pilot_kind)
        VALUES('Completion Foreign Tenant','active',$1,'legacy') RETURNING id`,[platformAdmin])).rows[0].id
      await client.query(`INSERT INTO public.pilot_institution_memberships(institution_id,user_id,role,assigned_by)
        VALUES($1,$2,'manager',$3)`,[foreignInstitution,foreignManager,platformAdmin])
    })

    function extractDataCheck(sql) {
      const blocks=[...sql.matchAll(/DO \$data_check\$[\s\S]*?\$data_check\$;/g)]
      expect(blocks).toHaveLength(1)
      return blocks[0][0]
    }

    async function runReadOnlyCheck(sql,checkName) {
      const results=await client.query(sql)
      const receipts=(Array.isArray(results)?results:[results])
        .flatMap(result=>result.rows??[]).filter(row=>row.check_name===checkName)
      expect(receipts).toHaveLength(1)
      expect(receipts[0]).toMatchObject({passed:true,read_only:true,production_readiness_proof:false})
      const expectedFields=[
        'check_name','completed_programs_checked','passed','production_readiness_proof','read_only',
      ]
      if(checkName==='institution_program_completion_211_postcheck') {
        expectedFields.push('functions_checked','deferred_triggers_checked','sync_triggers_checked')
        expect(receipts[0]).toMatchObject({functions_checked:5,deferred_triggers_checked:4,sync_triggers_checked:1})
      }
      expect(Object.keys(receipts[0]).sort()).toEqual(expectedFields.sort())
      const checked=Number(receipts[0].completed_programs_checked)
      expect(Number.isSafeInteger(checked)).toBe(true)
      expect(checked).toBeGreaterThanOrEqual(0)
      return receipts[0]
    }

    async function fixture(itemCount = 2) {
      const student = randomUUID()
      const name = `completion-${student.slice(0,8)}`
      await client.query('INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$2)', [student, name])
      await client.query(`INSERT INTO auth.users(id,email,email_confirmed_at)
        VALUES($1,$2,clock_timestamp())`, [student, `${name}@example.com`])
      const membership = (await client.query(`INSERT INTO public.teacher_classroom_memberships(
        classroom_id,student_id,accepted_at) VALUES($1,$2,$3::date-35) RETURNING id`, [classroom, student, weekStart])).rows[0].id
      await client.query('BEGIN')
      try {
        const program = (await client.query(`INSERT INTO public.institution_study_programs(
          institution_id,classroom_id,membership_id,student_id,teacher_id,week_start,status,
          daily_minute_limit,model_version,item_count,game,display_exam_ref,question_exam_ref,
          taxonomy_version,scope_policy_version)
          VALUES($1,$2,$3,$4,$5,$6,'draft',30,'institution-program-v1',$7,
            'matematik','TYT','TYT','ba-tyt-math-v1','institution-scope-v1') RETURNING id,program_ref`,
        [institutionOne,classroom,membership,student,managerOne,weekStart,itemCount])).rows[0]
        for (let position=1; position<=itemCount; position+=1) {
          await client.query(`INSERT INTO public.institution_study_program_items(
            program_id,position,scheduled_date,task_type,title,reason_code,outcome_code,duration_minutes,target_question_count)
            VALUES($1,$2,$3,'verified_questions','Execution-backed task','weak_outcome',$4,10,1)`,
          [program.id,position,weekStart,outcome.code])
        }
        await client.query(`UPDATE public.institution_study_programs
          SET status='published',reviewed_at=clock_timestamp(),published_at=clock_timestamp() WHERE id=$1`, [program.id])
        await client.query('COMMIT')
        return {...program,student,membership}
      } catch(error) { await client.query('ROLLBACK'); throw error }
    }

    async function prepareCompletion(program, position) {
      await rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)',
        [program.student,program.program_ref,position,randomUUID()])
      const sessionId=randomUUID(), attemptId=randomUUID(), answerId=randomUUID()
      await client.query('INSERT INTO public.game_sessions(id,user_id) VALUES($1,$2)',[sessionId,program.student])
      await client.query(`INSERT INTO public.verified_attempts(id,user_id,game,mode,started_at)
        VALUES($1,$2,'matematik','practice',clock_timestamp())`,[attemptId,program.student])
      await client.query(`INSERT INTO public.session_answers(id,session_id,user_id,question_id,is_correct,is_skipped)
        VALUES($1,$2,$3,$4,true,false)`,[answerId,sessionId,program.student,randomUUID()])
      await client.query(`INSERT INTO public.mastery_outcome_evidence(
        answer_id,attempt_id,user_id,outcome_id,is_correct,mapping_weight,
        difficulty_weighted_earned,difficulty_weighted_possible,max_hint_stage)
        VALUES($1,$2,$3,$4,true,1,1,1,0)`,[answerId,attemptId,program.student,outcome.id])
      return async (connection=client) => connection.query(`UPDATE public.verified_attempts
        SET session_id=$2,completed_at=clock_timestamp() WHERE id=$1`,[attemptId,sessionId])
    }

    async function complete(program,position) { await (await prepareCompletion(program,position))() }
    async function mature(program) {
      // Controlled clock fixture only: real starts must pass the unchanged
      // current-week gate before simulating the later review calendar. This
      // does not claim that a 3-hour execution can span 14 real days, or grant
      // permission to start a task after the published week has ended.
      await client.query(`UPDATE public.institution_study_programs
        SET week_start=$2::date-21 WHERE id=$1`,[program.id,weekStart])
    }
    async function status(program,connection=client) {
      return (await connection.query(`SELECT status,completed_at IS NOT NULL AS stamped
        FROM public.institution_study_programs WHERE id=$1`,[program.id])).rows[0]
    }
    async function review(program,requestId=randomUUID(),connection=null) {
      const values=[managerOne,program.program_ref,'insufficient',null,requestId]
      if(!connection) return rpc('public.review_institution_study_program($1,$2,$3,$4,$5)',values)
      await connection.query('SET LOCAL ROLE service_role')
      return (await connection.query('SELECT public.review_institution_study_program($1,$2,$3,$4,$5) AS result',values)).rows[0].result
    }
    async function newConnection() {
      const connection=new pg.Client({connectionString:url})
      await connection.connect()
      await connection.query("SET statement_timeout='10s'")
      await connection.query("SET lock_timeout='8s'")
      return connection
    }

    it('runs the exact standalone preflight before migration 211 and the postcheck after its idempotent apply',()=>{
      expect(preflightReceipt).toMatchObject({check_name:'institution_program_completion_211_preflight',passed:true,read_only:true})
      expect(initialPostcheckReceipt).toMatchObject({check_name:'institution_program_completion_211_postcheck',passed:true,read_only:true})
      expect(initialPostcheckReceipt.completed_programs_checked).toBe(preflightReceipt.completed_programs_checked)
    })

    it('accepts an empty completed-program domain without committing fixture changes',async()=>{
      await client.query('BEGIN')
      try {
        // Exercise the shared exact predicate, not the whole transaction-owning
        // release file. All temporary fixture changes are rolled back below.
        await client.query(`UPDATE public.institution_study_programs
          SET status='archived',archived_at=clock_timestamp() WHERE status='completed'`)
        expect((await client.query(`SELECT count(*)::int AS n
          FROM public.institution_study_programs WHERE status='completed'`)).rows[0].n).toBe(0)
        await client.query(dataCheckSql)
      } finally { await client.query('ROLLBACK') }
      await runReadOnlyCheck(postcheckSql,'institution_program_completion_211_postcheck')
    })

    it('accepts a genuinely execution-backed completed program using both complete READ ONLY check files',async()=>{
      const program=await fixture(1)
      await complete(program,1)
      await mature(program)
      await review(program)
      expect(await status(program)).toEqual({status:'completed',stamped:true})
      const before=await runReadOnlyCheck(preflightSql,'institution_program_completion_211_preflight')
      const after=await runReadOnlyCheck(postcheckSql,'institution_program_completion_211_postcheck')
      expect(Number(before.completed_programs_checked)).toBeGreaterThanOrEqual(1)
      expect(after.completed_programs_checked).toBe(before.completed_programs_checked)
      expect(await status(program)).toEqual({status:'completed',stamped:true})
    })

    it.each([
      ['pending task',`UPDATE public.institution_study_program_items
        SET status='pending',completed_at=NULL WHERE program_id=$1`],
      ['missing review',`DELETE FROM public.institution_study_program_reviews WHERE program_id=$1`],
      ['mismatched review actor',`UPDATE public.institution_study_program_reviews
        SET teacher_id=$2 WHERE program_id=$1`],
      ['missing completion timestamp',`UPDATE public.institution_study_programs
        SET completed_at=NULL WHERE id=$1`],
      ['partial item set',`UPDATE public.institution_study_programs SET item_count=2 WHERE id=$1`],
      ['missing underlying source evidence',`DELETE FROM public.mastery_outcome_evidence
        WHERE attempt_id IN (SELECT verified_attempt_id
          FROM public.institution_study_program_item_executions WHERE program_id=$1)`],
    ])('independent data check detects %s and rolls every tamper back',async(_label,tamperSql)=>{
      const program=await fixture(1)
      await complete(program,1)
      await mature(program)
      await review(program)
      expect(await status(program)).toEqual({status:'completed',stamped:true})
      await client.query('BEGIN')
      try {
        // Owner-only drift injection in the disposable database. Constraints
        // stay enabled and deferred; the independent release predicate must
        // detect the malformed row before COMMIT is ever considered.
        await client.query(tamperSql,tamperSql.includes('$2')?[program.id,foreignManager]:[program.id])
        await expect(client.query(dataCheckSql)).rejects.toMatchObject({
          code:'23514',message:expect.stringContaining('211 independent data check failed'),
        })
      } finally { await client.query('ROLLBACK') }
      expect(await status(program)).toEqual({status:'completed',stamped:true})
      await runReadOnlyCheck(postcheckSql,'institution_program_completion_211_postcheck')
    })

    it('rejects an RLS-limited inspection role instead of treating filtered rows as an empty proof',async()=>{
      await client.query('BEGIN')
      try {
        await client.query('SET LOCAL ROLE authenticated')
        await expect(client.query(dataCheckSql)).rejects.toMatchObject({
          code:'42501',message:'211 check requires an unrestricted database inspection role',
        })
      } finally { await client.query('ROLLBACK') }
      await runReadOnlyCheck(postcheckSql,'institution_program_completion_211_postcheck')
    })

    it.each([
      ['an exposed private helper',`GRANT EXECUTE ON FUNCTION
        public.institution_study_program_completion_ready(uuid) TO authenticated`,
      'function ACL mismatch'],
      ['a disabled item sync trigger',`ALTER TABLE public.institution_study_program_items
        DISABLE TRIGGER institution_program_item_completion_sync`,
      'item sync trigger mismatch'],
    ])('independent catalog check rejects %s without retaining any schema tamper',async(_label,tamperSql,reason)=>{
      await client.query('BEGIN')
      try {
        // Only this new migration's disposable schema is altered. Execute the
        // exact catalog DO block, never its transaction-owning SQL wrapper.
        await client.query(tamperSql)
        await expect(client.query(catalogCheckSql)).rejects.toMatchObject({
          code:'23514',message:`211 independent catalog check failed: ${reason}`,
        })
      } finally { await client.query('ROLLBACK') }
      await runReadOnlyCheck(postcheckSql,'institution_program_completion_211_postcheck')
    })

    it('observes one completed item without completing a pending or skipped program, then closes after the last trusted task',async()=>{
      const program=await fixture()
      await complete(program,1)
      const finish=await prepareCompletion(program,2)
      await mature(program)
      const requestId=randomUUID()
      const first=await review(program,requestId)
      expect(first).toMatchObject({programStatus:'published',replayed:false})
      expect(await status(program)).toEqual({status:'published',stamped:false})
      await client.query(`UPDATE public.institution_study_program_items SET status='skipped'
        WHERE program_id=$1 AND position=2`,[program.id])
      expect(await status(program)).toEqual({status:'published',stamped:false})
      await client.query(`UPDATE public.institution_study_program_items SET status='pending'
        WHERE program_id=$1 AND position=2`,[program.id])
      await finish()
      expect(await status(program)).toEqual({status:'completed',stamped:true})
      const replay=await review(program,requestId)
      // The historical mutation response is immutable, while history supplies current status.
      expect(replay).toEqual({...first,replayed:true})
      const history=await rpc('public.get_institution_student_program_history_v2($1,$2,$3,$4,$5)',[
        managerOne,classroom,(await client.query('SELECT member_ref FROM public.teacher_classroom_memberships WHERE id=$1',[program.membership])).rows[0].member_ref,'matematik','TYT'])
      expect(history.programs[0]).toMatchObject({status:'completed',review:{reviewRef:first.reviewRef}})
      expect((await client.query(`SELECT count(*)::int AS n FROM public.pilot_institution_requests
        WHERE operation='review_study_program' AND request_id=$1`,[requestId])).rows[0].n).toBe(1)
      expect((await client.query(`SELECT count(*)::int AS n FROM public.institution_operation_events
        WHERE event_type='study_program_reviewed' AND request_id=$1`,[requestId])).rows[0].n).toBe(1)
    })

    it('does not auto-complete before review; all work first then review completes once',async()=>{
      const program=await fixture()
      await complete(program,1); await complete(program,2)
      expect(await status(program)).toEqual({status:'published',stamped:false})
      await mature(program)
      const request=randomUUID()
      expect(await review(program,request)).toMatchObject({programStatus:'completed',replayed:false})
      expect(await status(program)).toEqual({status:'completed',stamped:true})
      await expectPgError(()=>rpc('public.review_institution_study_program($1,$2,$3,$4,$5)',
        [managerOne,program.program_ref,'effective',null,request]),'22023')
    })

    it('closes after a last diagnostic only when its actual scoped diagnostic session finishes',async()=>{
      const program=await fixture()
      await client.query(`UPDATE public.institution_study_program_items
        SET task_type='diagnostic',target_question_count=10
        WHERE program_id=$1 AND position=2`,[program.id])
      await complete(program,1)
      const candidates=(await client.query(`SELECT question.id,mapping.outcome_id
        FROM public.questions question
        JOIN public.question_outcomes mapping ON mapping.question_id=question.id AND mapping.is_primary
        JOIN public.curriculum_outcomes outcome ON outcome.id=mapping.outcome_id
        WHERE question.game='matematik' AND question.exam_ref='TYT' AND question.is_active
          AND outcome.game='matematik' AND outcome.exam_ref='TYT' AND outcome.taxonomy_version='ba-tyt-math-v1'
        ORDER BY mapping.outcome_id,question.id`)).rows
      const firsts=[...new Map(candidates.map(row=>[row.outcome_id,row.id])).values()]
      const plan=[...firsts,...candidates.filter(row=>!firsts.includes(row.id)).map(row=>row.id)].slice(0,10)
      expect(plan).toHaveLength(10)
      await rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)',
        [program.student,program.program_ref,2,randomUUID()])
      await mature(program); await review(program)
      const sessionId=randomUUID()
      const started=await rpc('public.start_adaptive_diagnostic_v3($1,$2,$3,$4,$5)',
        [program.student,sessionId,'matematik','TYT',plan[0]])
      let currentQuestion=started.currentQuestionId
      for(let index=0; index<10; index+=1) {
        const next=await rpc('public.record_adaptive_diagnostic_answer_v3($1,$2,$3,$4,$5,$6,$7)',
          [program.student,sessionId,currentQuestion,0,100,randomUUID(),index===9?null:plan[index+1]])
        if(index<9) {
          currentQuestion=next.nextQuestionId
          expect(await status(program)).toEqual({status:'published',stamped:false})
        } else expect(next.status).toBe('completed')
      }
      expect(await status(program)).toEqual({status:'completed',stamped:true})
    })

    it('rejects direct completion without a trusted source and rolls back evidence removal',async()=>{
      const program=await fixture()
      await complete(program,1)
      const finish=await prepareCompletion(program,2)
      await mature(program)
      await review(program)
      await client.query('BEGIN')
      try {
        await client.query(`UPDATE public.institution_study_program_items
          SET status='completed',completed_at=clock_timestamp() WHERE program_id=$1 AND position=2`,[program.id])
        await client.query(`UPDATE public.institution_study_programs
          SET status='completed',completed_at=clock_timestamp() WHERE id=$1`,[program.id])
        await expectPgError(()=>client.query('SET CONSTRAINTS ALL IMMEDIATE'),'23514')
      } finally { await client.query('ROLLBACK') }
      expect(await status(program)).toEqual({status:'published',stamped:false})
      await finish()
      await client.query('BEGIN')
      try {
        await client.query(`UPDATE public.institution_study_program_items
          SET status='pending',completed_at=NULL WHERE program_id=$1`,[program.id])
        await expectPgError(()=>client.query('SET CONSTRAINTS ALL IMMEDIATE'),'23514')
      } finally { await client.query('ROLLBACK') }
      expect(await status(program)).toEqual({status:'completed',stamped:true})
    })

    it('keeps archived programs archived even if a late trusted attempt completes',async()=>{
      const program=await fixture()
      await complete(program,1)
      const finish=await prepareCompletion(program,2)
      await mature(program); await review(program)
      await client.query(`UPDATE public.institution_study_programs
        SET status='archived',archived_at=clock_timestamp() WHERE id=$1`,[program.id])
      await finish()
      expect(await status(program)).toEqual({status:'archived',stamped:false})
    })

    it('preserves service-only, actor, tenant, maturity, lifecycle, and private helper boundaries',async()=>{
      const program=await fixture()
      for(const aal of ['aal1','aal2']) {
        await expectPgError(()=>authenticatedRpc(managerOne,
          'public.review_institution_study_program($1,$2,$3,$4,$5)',
          [managerOne,program.program_ref,'insufficient',null,randomUUID()],aal),'42501')
      }
      await expectPgError(()=>review(program),'22023')
      await complete(program,1)
      await mature(program)
      await expectPgError(()=>rpc('public.review_institution_study_program($1,$2,$3,$4,$5)',
        [foreignManager,program.program_ref,'insufficient',null,randomUUID()]),'P0002')
      await client.query("SELECT set_config('app.uid',$1,false)",[managerTwo])
      try { await expectPgError(()=>review(program),'42501') }
      finally { await client.query("SELECT set_config('app.uid','',false)") }
      const identities=[
        'public.institution_study_program_completion_ready(uuid)',
        'public.sync_institution_study_program_completion(uuid)',
        'public.enforce_institution_study_program_completion()',
        'public.sync_institution_study_program_item_completion()',
      ]
      for(const identity of identities) for(const role of ['public','anon','authenticated','service_role']) {
        expect((await client.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,identity])).rows[0].allowed).toBe(false)
      }
      await client.query("UPDATE public.profiles SET deleted_at=clock_timestamp() WHERE id=$1",[program.student])
      await expectPgError(()=>review(program),'P0002')
    })

    it.each(['review-first','last-item-first'])('serializes concurrent %s without premature completion',async(order)=>{
      const program=await fixture()
      await complete(program,1)
      const finish=await prepareCompletion(program,2)
      await mature(program)
      const a=await newConnection(), b=await newConnection()
      let second
      try {
        await a.query('BEGIN'); await b.query('BEGIN')
        if(order==='review-first') {
          expect(await review(program,randomUUID(),a)).toMatchObject({programStatus:'published'})
          second=finish(b)
        } else {
          await finish(a)
          second=review(program,randomUUID(),b)
        }
        // The first transaction still owns the shared v201 lock. The second
        // must not publish any partial state while it waits for that commit.
        expect(await status(program)).toEqual({status:'published',stamped:false})
        await a.query('COMMIT')
        await second
        await b.query('COMMIT')
        expect(await status(program)).toEqual({status:'completed',stamped:true})
      } finally {
        await a.query('ROLLBACK').catch(()=>{}); await b.query('ROLLBACK').catch(()=>{})
        if(second) await second.catch(()=>{})
        await a.end(); await b.end()
      }
    })

    it('rolls back review, completion, idempotency and audit together on failure',async()=>{
      const program=await fixture(1)
      await complete(program,1)
      await mature(program)
      const requestId=randomUUID()
      await client.query('BEGIN')
      try {
        expect(await review(program,requestId,client)).toMatchObject({programStatus:'completed'})
        await expectPgError(()=>client.query('SELECT 1/0'),'22012')
      } finally { await client.query('ROLLBACK'); await client.query('RESET ROLE') }
      expect(await status(program)).toEqual({status:'published',stamped:false})
      expect((await client.query(`SELECT count(*)::int n FROM public.institution_study_program_reviews WHERE program_id=$1`,[program.id])).rows[0].n).toBe(0)
      expect((await client.query(`SELECT count(*)::int n FROM public.pilot_institution_requests WHERE request_id=$1`,[requestId])).rows[0].n).toBe(0)
      expect((await client.query(`SELECT count(*)::int n FROM public.institution_operation_events WHERE request_id=$1`,[requestId])).rows[0].n).toBe(0)
    })
  })
}
