import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const required = {
 profiles:['id'], questions:['id','game','exam_ref','content','published_revision_id','is_active'],
 question_content_revisions:['id','question_id','game','exam_ref','status','content','content_sha256'],
 question_revision_source_reviews:['revision_id','content_sha256','report'],
 session_answers:['user_id','question_id','answered_at','session_id'],
 adaptive_diagnostic_answers:['user_id','question_id','created_at'],
 verified_attempts:['user_id','question_ids','started_at'],
 game_sessions:['id','user_id'], teacher_assignment_submissions:['id','student_id'],
 teacher_assignment_submission_items:['submission_id'],
}
const tables=['measurement_forms','measurement_form_releases','measurement_sessions','measurement_items']
const signatures=[
 'measurement_form_ready(uuid)','measurement_public_session(uuid,uuid)',
 'get_measurement_context(uuid)','start_measurement(uuid,uuid,uuid)',
 'record_measurement_event(uuid,uuid,text,integer,uuid,integer,boolean,boolean,boolean,text)',
 'measurement_feedback_blocked(uuid,uuid)','export_account_data(uuid)',
]
const literal=s=>"'"+s.replaceAll("'","''")+"'"
const migration=()=>readFileSync(new URL('./migrations/20261011062902_controlled_measurement.sql',import.meta.url),'utf8')
export function measurementReleaseSql(phase='preflight') {
 if(!['preflight','readback'].includes(phase)) throw new Error('phase must be preflight or readback')
 const dependencyRows=Object.entries(required).flatMap(([t,cols])=>cols.map(c=>`(${literal(t)},${literal(c)})`)).join(',')
 if(phase==='preflight') return `BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
WITH required(t,c) AS (VALUES ${dependencyRows})
SELECT jsonb_build_object('version','measurement-release@1','phase','preflight','checkedAt',transaction_timestamp(),
 'serverSupported',current_setting('server_version_num')::int>=150000,
 'missingColumns',(SELECT COALESCE(jsonb_agg(t||'.'||c),'[]'::jsonb) FROM required WHERE NOT EXISTS
   (SELECT 1 FROM information_schema.columns a WHERE a.table_schema='public' AND a.table_name=t AND a.column_name=c)),
 'helpersPresent',to_regprocedure('public.question_source_review_immutable()') IS NOT NULL
   AND to_regprocedure('public.question_revision_single_review_ready(uuid)') IS NOT NULL
   AND to_regprocedure('public.question_source_curriculum_binding_valid(uuid,jsonb)') IS NOT NULL
   AND to_regprocedure('public.export_account_data(uuid)') IS NOT NULL
   AND to_regprocedure('public.export_tyt_social_candidate_policy_data(uuid)') IS NOT NULL
   AND to_regprocedure('extensions.digest(text,text)') IS NOT NULL,
 'newObjectsAbsent',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname LIKE 'measurement_%'),
 'existingExportBodySha256',encode(extensions.digest((SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.export_account_data(uuid)')),'sha256'),'hex'),
 'databaseWrites',0) AS receipt;
COMMIT;`
 const bodies=[...migration().matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS (\$[a-z_]*\$)([\s\S]*?)\2/gi)]
 if(bodies.length!==signatures.length) throw new Error('Unexpected function count; update readback contract explicitly')
 const rows=bodies.map(m=>`(${literal(m[1])},${literal(createHash('sha256').update(m[3]).digest('hex'))})`).join(',')
 return `BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
WITH expected(name,sha) AS (VALUES ${rows})
SELECT jsonb_build_object('version','measurement-release@1','phase','readback','checkedAt',transaction_timestamp(),
 'matchingFunctionBodies',(SELECT count(*) FROM expected e JOIN pg_proc p ON p.proname=e.name AND p.pronamespace='public'::regnamespace
   WHERE encode(extensions.digest(p.prosrc,'sha256'),'hex')=e.sha),
 'privateRlsTables',(SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN (${tables.map(literal).join(',')}) AND c.relrowsecurity
   AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE')),
 'browserRpcGrants',(SELECT count(*) FROM unnest(ARRAY[${signatures.map(s=>literal('public.'+s)).join(',')}]) f WHERE
   has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE')),
 'serviceRpcGrants',(SELECT count(*) FROM unnest(ARRAY[${signatures.slice(2).map(s=>literal('public.'+s)).join(',')}]) f WHERE has_function_privilege('service_role',f,'EXECUTE')),
 'privateView',NOT has_table_privilege('anon','public.measurement_evidence_v1','SELECT') AND NOT has_table_privilege('authenticated','public.measurement_evidence_v1','SELECT')
   AND NOT has_table_privilege('service_role','public.measurement_evidence_v1','SELECT') AND EXISTS(SELECT 1 FROM pg_class WHERE oid='public.measurement_evidence_v1'::regclass AND 'security_invoker=true'=ANY(reloptions)),
 'formCount',(SELECT count(*) FROM public.measurement_forms),'enabledFormCount',(SELECT count(*) FROM public.measurement_form_releases WHERE enabled),
 'sessionCount',(SELECT count(*) FROM public.measurement_sessions),'databaseWrites',0) AS receipt;
COMMIT;`
}
export function verifyMeasurementRelease(receipt) {
 const errors=[]
 if(receipt?.version!=='measurement-release@1'||receipt.databaseWrites!==0) errors.push('invalid receipt contract')
 if(receipt?.phase==='preflight') {
  if(receipt.serverSupported!==true) errors.push('PostgreSQL 15+ required')
  if(!Array.isArray(receipt.missingColumns)||receipt.missingColumns.length) errors.push('dependency columns missing')
  if(receipt.helpersPresent!==true) errors.push('governance helper missing')
  if(receipt.newObjectsAbsent!==true) errors.push('measurement objects already exist; inspect drift before applying')
 } else if(receipt?.phase==='readback') {
  if(receipt.matchingFunctionBodies!==7) errors.push('function body drift')
  if(receipt.privateRlsTables!==4||receipt.privateView!==true) errors.push('private data boundary failed')
  if(receipt.browserRpcGrants!==0||receipt.serviceRpcGrants!==5) errors.push('RPC privilege mismatch')
  if(receipt.formCount!==0||receipt.enabledFormCount!==0||receipt.sessionCount!==0) errors.push('default-off rollout must be empty')
 } else errors.push('unknown phase')
 return {ok:errors.length===0,errors,activationAuthorized:false,calibrated:false}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(process.argv[2]==='sql') process.stdout.write(measurementReleaseSql(process.argv[3])+'\n')
 else if(process.argv[2]==='check'&&process.argv[3]) {
  const result=verifyMeasurementRelease(JSON.parse(readFileSync(process.argv[3],'utf8')))
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1
 } else throw new Error('Usage: measurement-release-check.mjs sql preflight|readback / check receipt.json')
}
