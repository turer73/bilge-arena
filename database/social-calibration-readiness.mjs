// Read-only coverage for the existing revision psychometrics pipeline, NOT an
// IRT fit, a promotion decision, or a second psychometrics materializer.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hash = /^[0-9a-f]{64}$/
export const ROLES = ['common_history', 'common_geography', 'common_philosophy', 'standard_religion', 'alternate_philosophy']
export const V3 = 'verified_first_question_exposure_no_hint_no_timing_normalized_rest_v3'

export function readinessSql(poolId) {
  assert(uuid.test(poolId), 'A literal pool UUID is required')
  return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
WITH pool AS MATERIALIZED (
  SELECT * FROM public.tyt_social_reviewed_preparation_pools WHERE id='${poolId}'::uuid
), pins AS MATERIALIZED (
  SELECT (pin->>'questionId')::uuid question_id, (pin->>'revisionId')::uuid revision_id,
    pin->>'contentSha256' content_sha256, pin->>'examRole' exam_role, p.policy_version
  FROM pool p CROSS JOIN LATERAL jsonb_array_elements(p.pins) pin
), observations AS MATERIALIZED (
  SELECT p.revision_id, a.id, a.is_skipped, a.selected_option,
    EXISTS (SELECT 1 FROM public.verified_attempts va
      JOIN public.game_sessions gs ON gs.id=va.session_id AND gs.user_id=va.user_id AND gs.status='completed'
      JOIN public.verified_attempt_question_revisions s ON s.attempt_id=va.id
      WHERE va.session_id=a.session_id AND va.user_id=a.user_id AND va.completed_at IS NOT NULL
        AND s.question_id=p.question_id AND s.revision_id=p.revision_id AND s.content_sha256=p.content_sha256) verified,
    EXISTS (SELECT 1 FROM public.verified_attempts va
      JOIN public.verified_attempt_candidate_policy_snapshots h ON h.attempt_id=va.id AND h.user_id=va.user_id
      WHERE va.session_id=a.session_id AND va.user_id=a.user_id
        AND h.policy_version=p.policy_version AND h.artifact_kind='practice') pilot,
    EXISTS (SELECT 1 FROM public.verified_attempts va
      JOIN public.verified_attempt_hint_events hint ON hint.attempt_id=va.id AND hint.question_id=a.question_id
      WHERE va.session_id=a.session_id AND va.user_id=a.user_id) hint,
    (EXISTS (SELECT 1 FROM public.session_answers earlier WHERE earlier.user_id=a.user_id
      AND earlier.question_id=a.question_id AND (earlier.answered_at,earlier.id)<(a.answered_at,a.id))
    OR EXISTS (SELECT 1 FROM public.adaptive_diagnostic_answers d WHERE d.user_id=a.user_id
      AND d.question_id=a.question_id AND d.created_at<a.answered_at)) repeated
  FROM pins p JOIN public.session_answers a ON a.question_revision_id=p.revision_id AND a.question_id=p.question_id
  WHERE a.answered_at<transaction_timestamp()
), eligible AS MATERIALIZED (
  SELECT * FROM observations WHERE verified AND NOT hint AND NOT repeated
    AND NOT coalesce(is_skipped,false) AND selected_option BETWEEN 0 AND 4
), items AS (
  SELECT p.*,
    EXISTS(SELECT 1 FROM public.question_content_revisions r WHERE r.id=p.revision_id
      AND r.question_id=p.question_id AND r.content_sha256=p.content_sha256) pin_matches,
    (SELECT count(*)::int FROM observations a WHERE a.revision_id=p.revision_id) raw_n,
    (SELECT count(*)::int FROM eligible a WHERE a.revision_id=p.revision_id) descriptive_n,
    (SELECT count(*)::int FROM eligible a WHERE a.revision_id=p.revision_id AND a.pilot) pilot_n,
    (SELECT count(*)::int FROM public.session_answers a WHERE a.question_id=p.question_id
      AND a.question_revision_id IS DISTINCT FROM p.revision_id AND a.answered_at<transaction_timestamp()) old_n
  FROM pins p
)
SELECT jsonb_build_object('schemaVersion','social-calibration-snapshot@1','checkedAt',transaction_timestamp(),
  'poolId',p.id,'policyVersion',p.policy_version,'manifestSha256',p.manifest_sha256,
  'v3PolicyPresent',position('${V3}' in pg_get_functiondef(
    'public.materialize_question_revision_psychometrics(uuid,uuid,timestamptz,timestamptz,uuid)'::regprocedure))>0,
  'issuedAttempts',(SELECT count(*)::int FROM public.verified_attempt_candidate_policy_snapshots h
    WHERE h.policy_version=p.policy_version AND h.artifact_kind='practice'),
  'completedAttempts',(SELECT count(*)::int FROM public.verified_attempt_candidate_policy_snapshots h
    JOIN public.verified_attempts va ON va.id=h.attempt_id AND va.user_id=h.user_id
    WHERE h.policy_version=p.policy_version AND h.artifact_kind='practice' AND va.completed_at IS NOT NULL),
  'items',(SELECT jsonb_agg(jsonb_build_object('questionId',i.question_id,'revisionId',i.revision_id,
    'contentSha256',i.content_sha256,'role',i.exam_role,'pinMatches',i.pin_matches,
    'rawN',i.raw_n,'descriptiveN',i.descriptive_n,'pilotN',i.pilot_n,'otherRevisionN',i.old_n)
    ORDER BY i.exam_role,i.question_id) FROM items i)) AS snapshot
FROM pool p;
COMMIT;`
}

function count(value) { assert(Number.isSafeInteger(value) && value >= 0, 'Invalid observation count'); return value }
export function coverageBand(n) {
  count(n)
  return n === 0 ? 'no_data' : n < 30 ? 'early_signal' : n < 100 ? 'temporary_observation'
    : n < 200 ? 'ctt_review_candidate' : 'larger_sample_review_candidate'
}

export function buildReadinessReport(snapshot, expectedPoolId) {
  assert(uuid.test(expectedPoolId) && snapshot?.poolId === expectedPoolId, 'Wrong pool')
  assert(snapshot.schemaVersion === 'social-calibration-snapshot@1', 'Unsupported snapshot')
  assert(snapshot.policyVersion === 'tyt-social-2027-v1', 'Wrong policy')
  assert(hash.test(snapshot.manifestSha256), 'Missing manifest hash')
  assert(typeof snapshot.checkedAt === 'string' && Number.isFinite(Date.parse(snapshot.checkedAt)), 'Invalid receipt time')
  assert(snapshot.v3PolicyPresent === true, 'Existing v3 policy not found')
  const issued = count(snapshot.issuedAttempts), completed = count(snapshot.completedAttempts)
  assert(completed <= issued, 'Completed exceeds issued')
  assert(Array.isArray(snapshot.items) && snapshot.items.length === 25, 'Expected 25 pins')
  const questions = new Set(), revisions = new Set()
  const items = snapshot.items.map(item => {
    assert(uuid.test(item.questionId) && uuid.test(item.revisionId) && hash.test(item.contentSha256), 'Invalid pin')
    assert(!questions.has(item.questionId) && !revisions.has(item.revisionId), 'Duplicate pin')
    questions.add(item.questionId); revisions.add(item.revisionId)
    assert(item.pinMatches === true && ROLES.includes(item.role), 'Changed pin or role')
    const rawN=count(item.rawN), descriptiveN=count(item.descriptiveN), pilotN=count(item.pilotN)
    assert(pilotN <= descriptiveN && descriptiveN <= rawN && pilotN <= completed, 'Inconsistent counts')
    return { questionId:item.questionId, revisionId:item.revisionId, contentSha256:item.contentSha256,
      role:item.role, rawN, descriptiveN, pilotN, otherRevisionN:count(item.otherRevisionN),
      pilotCoverage:coverageBand(pilotN), pilotResponsesTo100:Math.max(0,100-pilotN) }
  })
  for (const role of ROLES) assert(items.filter(i=>i.role===role).length===5, 'Expected five pins per role')
  const total = key => items.reduce((sum,item)=>sum+item[key],0)
  return {
    schemaVersion:'social-calibration-readiness@1', checkedAt:snapshot.checkedAt,
    poolId:expectedPoolId, policyVersion:snapshot.policyVersion, manifestSha256:snapshot.manifestSha256,
    status:total('pilotN')===0 ? 'awaiting_pilot_responses' : 'descriptive_evidence_only',
    issuedAttempts:issued, completedAttempts:completed,
    currentRevisionResponses:total('rawN'), descriptiveResponses:total('descriptiveN'),
    pilotDescriptiveResponses:total('pilotN'), excludedOtherRevisionResponses:total('otherRevisionN'),
    thresholdsAreOperationalNotScientific:true,
    // No count, including 200+, may authorize an IRT model or level claim.
    calibrated:false, levelMeasurementAuthorized:false, databaseWrites:0,
    blockers:['CONTROLLED_FIELD_TEST_PROTOCOL_NOT_ACCEPTED','MEASUREMENT_TELEMETRY_NOT_VERIFIED',
      'TARGET_SAMPLE_NOT_VALIDATED','MODEL_FIT_AND_VALIDITY_NOT_ESTABLISHED','LEVEL_CUTS_NOT_VALIDATED'],
    limits:['Immediate-feedback practice is not a closed assessment.',
      'First recorded answer does not prove first visual exposure.',
      'No-hint history does not prove no external assistant; no surveillance is inferred.',
      'Client timing and stable rendering are not verified by the v3 materializer.',
      'Variants and different forms must not be pooled as equivalent abilities.',
      'This file validates coverage arithmetic, not the authenticity of a supplied snapshot.'],
    items,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command,argument,poolId,...extra] = process.argv.slice(2)
    assert(extra.length===0, 'Unexpected arguments')
    if(command==='sql' && argument && poolId===undefined) console.log(readinessSql(argument))
    else if(command==='report' && argument && poolId) {
      console.log(JSON.stringify(buildReadinessReport(JSON.parse(readFileSync(argument,'utf8')),poolId),null,2))
    } else throw new Error('Usage: node database/social-calibration-readiness.mjs sql <pool-uuid> | report <snapshot.json> <pool-uuid>')
  } catch(error) { console.error(error.message); process.exitCode=1 }
}
