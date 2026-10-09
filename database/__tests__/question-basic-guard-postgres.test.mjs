import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {readFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {startSourceReviewPostgres} from './helpers/isolated-source-review-postgres.mjs'

const bin=process.env.SOURCE_REVIEW_PG_BIN
if(process.env.SOURCE_REVIEW_PG_REQUIRED==='1'&&!bin) throw Error('Native basic-guard acceptance may not skip')
const runtime=resolve(process.env.PGLITE_RUNTIME_PATH??'secure/sql-test-runtime/node_modules/@electric-sql/pglite/dist')
const suite=bin||existsSync(resolve(runtime,'index.js'))?describe:describe.skip
const sql=name=>readFileSync(resolve('database/migrations',name),'utf8')
const upgrade=sql('20261009063101_question_content_exam_option_guard.sql')
const content=(count=4)=>({question:'TEST ONLY: Which number equals two plus three?',options:['3','4','5','6','7'].slice(0,count),answer:2,solution:'TEST ONLY: 2 + 3 equals 5.'})
const legacyId='00000000-0000-4000-8000-000000000001'
const malformed=[
 ['null',null],['array',[]],['no options',{...content(),options:null}],
 ['object options',{...content(),options:{a:'3'}}],['missing answer',{...content(),answer:undefined}],
 ['null answer',{...content(),answer:null}],['string answer',{...content(),answer:'2'}],
 ['negative answer',{...content(),answer:-1}],['fractional answer',{...content(),answer:1.5}],
 ['boolean answer',{...content(),answer:true}],['LGS fifth index',{...content(),answer:4}],
 ['too-short stem',{...content(),question:'2+3?'}],['too-long stem',{...content(),question:'x'.repeat(4001)}],
 ['missing solution',{...content(),solution:undefined}],['too-short solution',{...content(),solution:'5'}],
 ['too-long solution',{...content(),solution:'x'.repeat(3001)}],
 ['numeric option',{...content(),options:[3,'4','5','6']}],
 ['empty option',{...content(),options:['','4','5','6']}],
 ['long option',{...content(),options:['x'.repeat(601),'4','5','6']}],
 ...['Hiçbiri.','Hepsi','Yukarıdakilerin hepsi','Yukarıdakilerden hiçbiri'].map(opt=>['forbidden '+opt,{...content(),options:[opt,'4','5','6']}]),
]

suite(`Exam-aware content guard ${bin?'native PostgreSQL':'WASM'} (fresh isolated database)`,()=>{
 let db,oldResults
 const scalar=async(query,values=[]) => (await db.query(query,values)).rows[0].result
 const check=(value=content(),exam='LGS',game='sosyal')=>scalar('SELECT public.question_content_basic_guard_for_exam($1,$2::jsonb,$3) AS result',[game,JSON.stringify(value),exam])
 const insert=(exam='LGS',value=content(),game='sosyal')=>db.query('INSERT INTO public.questions(id,game,exam_ref,content,is_active) VALUES($1,$2,$3,$4,true) RETURNING id',[randomUUID(),game,exam,JSON.stringify(value)])
 const parity=[content(5),...malformed.map(([,c])=>c),
  {...content(5),options:['I. Mahmut','II. Mahmut','III. Selim','IV. Murat','V. Mehmet']},
  {...content(5),options:['I. Sıcaklık zamanla sürekli artar','II. Basınç sürekli değişir','Yalnız I','I ve II','Yalnız II']},
  {...content(5),options:['I. neden sonuç, II. amaç sonuç','A','B','C','D']},
  // C/--no-locale does not lowercase non-ASCII C-cedilla. Preserve 079's
  // locale-dependent behavior; this release changes exam count, not text folding.
  {...content(5),options:['HİÇBİRİ','4','5','6','7']},
 ]
 beforeAll(async()=>{
  if(bin) db=await startSourceReviewPostgres(bin)
  else {const {PGlite}=await import(pathToFileURL(resolve(runtime,'index.js')).href);db=new PGlite()}
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE public.questions(id uuid PRIMARY KEY,game text,exam_ref text,content jsonb,is_active boolean,updated_at timestamptz);')
  await db.exec(sql('079_questions_content_basic_guard.sql'))
  expect(await scalar("SELECT public.question_content_basic_guard('sosyal',$1) AS result",[JSON.stringify(content())])).toBe(false)
  expect(await scalar("SELECT public.question_content_basic_guard('sosyal',$1) AS result",[JSON.stringify(content(5))])).toBe(true)
  oldResults=[]
  for(const value of parity)oldResults.push(await scalar("SELECT public.question_content_basic_guard('sosyal',$1) AS result",[JSON.stringify(value)]))
  // Legacy LGS five-option row accepted by 079; migration must not alter history.
  await db.query("INSERT INTO public.questions(id,game,exam_ref,content,is_active) VALUES($1,'sosyal','LGS',$2,true)",[legacyId,JSON.stringify(content(5))])
  const before=await db.query('SELECT * FROM public.questions')
  await db.exec(upgrade);await db.exec(upgrade)
  expect((await db.query('SELECT * FROM public.questions')).rows).toEqual(before.rows)
 },60_000)
 beforeEach(async()=>{await db.exec('BEGIN')})
 afterEach(async()=>{await db.exec('ROLLBACK')})
 afterAll(async()=>{await db?.close()})
 it.each(['LGS',' lgs ','lGs'])('accepts exactly four for %s and denies five',async exam=>{
  expect(await check(content(),exam)).toBe(true);expect(await check(content(5),exam)).toBe(false)
  expect(await check({...content(),answer:3},exam)).toBe(true)
 })
 it.each(['TYT','AYT','AYT-SAY','AYT-EA','AYT-SOZ','YKS','YDT',null,'','UNKNOWN','LGS-UNKNOWN'])('preserves five-option default for %s',async exam=>{
  expect(await check(content(5),exam)).toBe(true);expect(await check(content(),exam)).toBe(false)
  expect(await check({...content(5),answer:4},exam)).toBe(true)
  expect(await check({...content(5),answer:5},exam)).toBe(false)
 })
 it.each(malformed)('rejects malformed LGS: %s',async(_name,value)=>{expect(await check(value)).toBe(false)})
 it('preserves every sampled legacy two-argument verdict including Roman-option controls',async()=>{
  for(let i=0;i<parity.length;i++)expect(await scalar("SELECT public.question_content_basic_guard('sosyal',$1) AS result",[JSON.stringify(parity[i])])).toBe(oldResults[i])
 })
 it('keeps the legacy WordQuest exception',async()=>{expect(await check({cloze:'legacy'},'YDT','wordquest')).toBe(true)})
 it('retains the original locale-dependent uppercase Turkish behavior',async()=>{
  expect(await check({...content(),options:['HİÇBİRİ','4','5','6']})).toBe(oldResults.at(-1))
 })
 it('inserts four-option LGS using the actual table trigger',async()=>{await expect(insert()).resolves.toMatchObject({rowCount:1})})
 it('blocks five-option LGS INSERT',async()=>{await expect(insert('LGS',content(5))).rejects.toMatchObject({code:'23514'})})
 it('blocks four-option TYT INSERT',async()=>{await expect(insert('TYT')).rejects.toMatchObject({code:'23514'})})
 it('blocks invalid content UPDATE',async()=>{
  const id=(await insert()).rows[0].id
  await expect(db.query("UPDATE public.questions SET content=jsonb_set(content,'{answer}','4') WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'})
 })
 it.each([['LGS','TYT',4],['TYT','LGS',5]])('exam-only %s to %s cannot bypass option count',async(from,to,count)=>{
  const id=(await insert(from,content(count))).rows[0].id
  await expect(db.query('UPDATE public.questions SET exam_ref=$1 WHERE id=$2',[to,id])).rejects.toMatchObject({code:'23514'})
 })
 it('changing game cannot move malformed WordQuest content into a standard game',async()=>{
  const id=(await insert('TYT',{cloze:'legacy'},'wordquest')).rows[0].id
  await expect(db.query("UPDATE public.questions SET game='sosyal' WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'})
 })
 it('allows a simultaneous valid exam and content revision',async()=>{
  const id=(await insert('TYT',content(5))).rows[0].id
  await expect(db.query("UPDATE public.questions SET exam_ref='LGS',content=$1 WHERE id=$2",[JSON.stringify(content()),id])).resolves.toMatchObject({rowCount:1})
 })
 it('does not lock metadata toggles or no-op writes on existing legacy-invalid rows',async()=>{
  await expect(db.query('UPDATE public.questions SET is_active=false,updated_at=clock_timestamp(),content=content,exam_ref=exam_ref WHERE id=$1',[legacyId])).resolves.toMatchObject({rowCount:1})
 })
 it('revalidates a changed legacy content payload',async()=>{
  await expect(db.query("UPDATE public.questions SET content=jsonb_set(content,'{solution}','\"Changed valid length solution\"') WHERE id=$1",[legacyId])).rejects.toMatchObject({code:'23514'})
 })
 it('uses invoker functions, fixed search paths and preserves the pure public predicate contract',async()=>{
  const rows=(await db.query("SELECT p.proname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('question_content_basic_guard','question_content_basic_guard_for_exam','tg_questions_content_basic_guard')")).rows
  expect(rows).toHaveLength(3)
  for(const r of rows){expect(r.prosecdef).toBe(false);expect(r.proconfig).toEqual(['search_path=pg_catalog'])}
  for(const role of ['anon','authenticated','service_role'])expect(await scalar("SELECT has_function_privilege($1,'public.question_content_basic_guard_for_exam(text,jsonb,text)','EXECUTE') AS result",[role])).toBe(true)
 })
})
